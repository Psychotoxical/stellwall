"""Raises the version for a release candidate and brings main up to date after a release.

    python .github/release/bump_version.py get
    python .github/release/bump_version.py next [PUBLISHED ...]
    python .github/release/bump_version.py sync VERSION RELEASED_CHANGELOG

get:  prints the version (from the first file in VERSION_FILES).
next: PUBLISHED are the versions that are already released. If the current version is one of
      them, every file in VERSION_FILES gets the next free patch version. The entries under
      [Unreleased] in CHANGELOG.md become the section of the version unless it has one, also
      for a first release that keeps its number. Prints the version. Used by the
      main -> next workflow on the next branch only.
sync: after VERSION was released, main gets that version and the section from the released
      CHANGELOG.md; the entries that went into the release leave [Unreleased].
"""
import datetime
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CHANGELOG = ROOT / "CHANGELOG.md"

# Every place that holds the version: (file, pattern, how many matches). The pattern has a
# named group "v" around the version; count 0 replaces every match. The first entry is the one
# the version is read from. Lock files (Cargo.lock, package-lock.json) are refreshed by the
# workflow after this script, not here.
VERSION_FILES: list[tuple[str, str, int]] = [
    ("package.json", r'^  "version": "(?P<v>[^"]+)"', 1),
    ("package-lock.json", r'^  "version": "(?P<v>[^"]+)"', 1),
    ("package-lock.json", r'^    "": \{\n      "name": "stellwall",\n      "version": "(?P<v>[^"]+)"', 1),
]

HEADING = re.compile(r"^## \[(?P<version>[^\]]+)\].*$", re.MULTILINE)


def key(version: str) -> tuple[int, ...]:
    return tuple(int(p) for p in version.split("."))


def bump_patch(version: str) -> str:
    major, minor, patch = key(version)
    return f"{major}.{minor}.{patch + 1}"


def next_version(current: str, published: set[str]) -> str:
    version = current
    while version in published:
        version = bump_patch(version)
    return version


def next_changelog(text: str, current: str, published: set[str], date: str) -> tuple[str, str]:
    """The version for the next channel and the CHANGELOG.md for it: a released version gets
    the next patch number; [Unreleased] becomes the section of that version unless it has one
    (the first release keeps its number and still gets its section)."""
    version = next_version(current, published)
    if version != current or not _find(text, version):
        text = release_unreleased(text, version, date)
    return version, text


def replace_version(text: str, pattern: str, version: str, count: int = 1) -> str:
    rx = re.compile(pattern, re.M)
    done = 0

    def sub(m: re.Match) -> str:
        nonlocal done
        if count and done >= count:
            return m.group(0)
        done += 1
        start, end = m.span("v")
        return m.group(0)[: start - m.start()] + version + m.group(0)[end - m.start():]

    out = rx.sub(sub, text)
    if not done:
        raise ValueError(f"pattern {pattern!r} found nothing")
    return out


def _sections(text: str) -> list[tuple[str, int, int, int]]:
    """(version, start of heading, start of body, end of body) for every '## [...]' heading."""
    matches = list(HEADING.finditer(text))
    return [(m.group("version"), m.start(), m.end(),
             matches[i + 1].start() if i + 1 < len(matches) else len(text))
            for i, m in enumerate(matches)]


def _find(text: str, version: str) -> tuple[str, int, int, int] | None:
    return next((s for s in _sections(text) if s[0] == version), None)


def release_unreleased(text: str, version: str, date: str) -> str:
    """Turns the entries under [Unreleased] into the section of version; unchanged if it has one."""
    if _find(text, version):
        return text
    unreleased = _find(text, "Unreleased")
    if not unreleased:
        raise ValueError("CHANGELOG.md has no '## [Unreleased]' section")
    _, start, body_start, end = unreleased
    body = text[body_start:end].strip()
    if not body:
        raise ValueError("CHANGELOG.md has nothing under [Unreleased] to release")
    return text[:start] + f"## [Unreleased]\n\n## [{version}] - {date}\n\n{body}\n\n" + text[end:]


def _drop_empty_headings(lines: list[str]) -> list[str]:
    """Removes '###' headings that have no entry left before the next heading."""
    kept: list[str] = []
    for i, line in enumerate(lines):
        if line.startswith("### "):
            rest = lines[i + 1:]
            nxt = next((j for j, r in enumerate(rest) if r.startswith("#")), len(rest))
            if not any(r.strip() for r in rest[:nxt]):
                continue
        kept.append(line)
    return kept


def sync_released(text: str, released: str, version: str) -> str:
    """Adds the section of version from released and takes its entries out of [Unreleased]."""
    if _find(text, version):
        return text
    found = _find(released, version)
    if not found:
        raise ValueError(f"the released CHANGELOG.md has no section for {version}")
    _, r_start, r_body_start, r_end = found
    heading = released[r_start:r_body_start]
    body = released[r_body_start:r_end].strip()
    entries = {line for line in body.splitlines() if line.strip() and not line.startswith("#")}

    unreleased = _find(text, "Unreleased")
    if not unreleased:
        raise ValueError("CHANGELOG.md has no '## [Unreleased]' section")
    _, start, body_start, end = unreleased
    left = [line for line in text[body_start:end].strip().splitlines() if line not in entries]
    left_text = re.sub(r"\n{3,}", "\n\n", "\n".join(_drop_empty_headings(left))).strip()
    block = "## [Unreleased]\n\n" + (f"{left_text}\n\n" if left_text else "") + f"{heading}\n\n{body}\n\n"
    return text[:start] + block + text[end:]


def _read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def _write(path: pathlib.Path, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def current_version() -> str:
    path, pattern, _ = VERSION_FILES[0]
    m = re.search(pattern, _read(ROOT / path), re.M)
    if not m:
        raise ValueError(f"no version in {path}")
    return m.group("v")


def set_version(version: str) -> None:
    for path, pattern, count in VERSION_FILES:
        _write(ROOT / path, replace_version(_read(ROOT / path), pattern, version, count))


def main(argv: list[str]) -> int:
    try:
        if argv[1:] == ["get"]:
            print(current_version())
            return 0
        if len(argv) >= 2 and argv[1] == "next":
            current = current_version()
            today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
            old = _read(CHANGELOG)
            version, text = next_changelog(old, current, set(argv[2:]), today)
            if text != old:
                _write(CHANGELOG, text)
            if version != current:
                set_version(version)
            print(version)
            return 0
        if len(argv) == 4 and argv[1] == "sync":
            version = argv[2]
            _write(CHANGELOG, sync_released(_read(CHANGELOG), _read(pathlib.Path(argv[3])), version))
            if key(current_version()) < key(version):
                set_version(version)
            return 0
    except (ValueError, IndexError) as e:
        print(e, file=sys.stderr)
        return 1
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
