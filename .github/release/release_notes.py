"""Prints the release text of a version: its CHANGELOG.md section plus the download table.

    python .github/release/release_notes.py VERSION

The download table comes from .github/release/downloads.md ({version} is filled in); without
that file there is none. Exits with 1 if the section is missing or empty.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOWNLOADS = pathlib.Path(__file__).resolve().parent / "downloads.md"
HEADING = re.compile(r"^## \[(?P<version>[^\]]+)\].*$", re.MULTILINE)


def section(text: str, version: str) -> str:
    """The body of the section for version, without its heading; empty if there is none."""
    matches = list(HEADING.finditer(text))
    for i, m in enumerate(matches):
        if m.group("version") == version:
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            return text[m.end():end].strip()
    return ""


def notes(text: str, version: str, downloads: str = "") -> str:
    body = section(text, version)
    if not body:
        raise ValueError(f"CHANGELOG.md has no section for {version}")
    body = re.sub(r"^### ", "## ", body, flags=re.MULTILINE)
    table = downloads.replace("{version}", version).strip()
    return f"{body}\n\n{table}" if table else body


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    downloads = DOWNLOADS.read_text(encoding="utf-8") if DOWNLOADS.exists() else ""
    try:
        print(notes((ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), argv[1], downloads))
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
