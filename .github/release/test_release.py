"""Tests for the release scripts; the CI runs them in the lint job:
python -m unittest discover -s .github/release -p "test_*.py"
"""
import importlib.util
import pathlib
import unittest

HERE = pathlib.Path(__file__).resolve().parent


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bump_version = _load("bump_version")
release_notes = _load("release_notes")
check_changelog = _load("check_changelog")

MAIN = """# Changelog

Intro.

## [Unreleased]

### Added

- later
- feature

### Fixed

- bug

## [1.2.0] - 2026-01-02

### Added

- new
"""


class BumpVersionTests(unittest.TestCase):
    def test_next_version_skips_released_ones(self):
        self.assertEqual(bump_version.next_version("1.2.0", {"1.2.0"}), "1.2.1")
        self.assertEqual(bump_version.next_version("1.2.0", {"1.2.0", "1.2.1"}), "1.2.2")
        self.assertEqual(bump_version.next_version("1.2.1", {"1.2.0"}), "1.2.1")

    def test_first_release_takes_unreleased_without_a_bump(self):
        first = MAIN.replace("## [1.2.0] - 2026-01-02\n\n### Added\n\n- new\n", "")
        version, text = bump_version.next_changelog(first, "1.0.0", set(), "2026-02-03")
        self.assertEqual(version, "1.0.0")
        self.assertIn("## [Unreleased]\n\n## [1.0.0] - 2026-02-03\n\n### Added\n\n- later", text)

    def test_released_version_gets_the_next_patch(self):
        version, text = bump_version.next_changelog(MAIN, "1.2.0", {"1.2.0"}, "2026-02-03")
        self.assertEqual(version, "1.2.1")
        self.assertIn("## [1.2.1] - 2026-02-03", text)

    def test_replace_version_keeps_the_rest_of_the_line(self):
        package = '{\n  "name": "app",\n  "version": "1.2.0",\n  "dependencies": {\n    "x": {\n  "version": "9.9.9"\n'
        out = bump_version.replace_version(package, r'^  "version": "(?P<v>[^"]+)"', "1.2.1", 1)
        self.assertIn('  "version": "1.2.1",\n', out)
        self.assertIn('  "version": "9.9.9"', out)
        toml = '[package]\nversion = "1.2.0"\n\n[tool]\ntarget-version = "x"\n'
        self.assertEqual(bump_version.replace_version(toml, r'^version = "(?P<v>[^"]+)"$', "1.2.1"),
                         '[package]\nversion = "1.2.1"\n\n[tool]\ntarget-version = "x"\n')

    def test_replace_version_without_a_match_is_an_error(self):
        with self.assertRaises(ValueError):
            bump_version.replace_version("nothing", r'^version = "(?P<v>[^"]+)"$', "1.2.1")

    def test_version_files_are_filled_in(self):
        # the template ships with VERSION_FILES commented out; a set-up repo must have entries
        if not bump_version.VERSION_FILES:
            self.skipTest("VERSION_FILES still empty (template)")
        self.assertRegex(bump_version.current_version(), r"^\d+\.\d+\.\d+$")

    def test_unreleased_becomes_the_new_section(self):
        text = bump_version.release_unreleased(MAIN, "1.2.1", "2026-02-03")
        self.assertIn("## [Unreleased]\n\n## [1.2.1] - 2026-02-03\n\n### Added\n\n- later\n- feature\n\n"
                      "### Fixed\n\n- bug\n\n## [1.2.0] - 2026-01-02", text)
        self.assertTrue(text.startswith("# Changelog\n\nIntro.\n\n"))
        self.assertEqual(bump_version.release_unreleased(MAIN, "1.2.0", "2026-02-03"), MAIN)

    def test_empty_unreleased_is_an_error(self):
        empty = "# Changelog\n\n## [Unreleased]\n\n## [1.2.0] - 2026-01-02\n\n- new\n"
        with self.assertRaises(ValueError):
            bump_version.release_unreleased(empty, "1.2.1", "2026-02-03")

    def test_sync_moves_released_entries_out_of_unreleased(self):
        released = bump_version.release_unreleased(MAIN.replace("- later\n", ""), "1.2.1", "2026-02-03")
        text = bump_version.sync_released(MAIN, released, "1.2.1")
        self.assertIn("## [Unreleased]\n\n### Added\n\n- later\n\n## [1.2.1] - 2026-02-03\n\n"
                      "### Added\n\n- feature\n\n### Fixed\n\n- bug\n\n## [1.2.0]", text)
        self.assertEqual(bump_version.sync_released(text, released, "1.2.1"), text)
        full = bump_version.release_unreleased(MAIN, "1.2.1", "2026-02-03")
        self.assertEqual(bump_version.sync_released(MAIN, full, "1.2.1"), full)


class ReleaseNotesTests(unittest.TestCase):
    def test_section_and_downloads(self):
        text = release_notes.notes(MAIN, "1.2.0", "## Download\n\n`app-{version}.zip`\n")
        self.assertEqual(text, "## Added\n\n- new\n\n## Download\n\n`app-1.2.0.zip`")
        self.assertEqual(release_notes.notes(MAIN, "1.2.0"), "## Added\n\n- new")

    def test_missing_section_is_an_error(self):
        with self.assertRaises(ValueError):
            release_notes.notes(MAIN, "1.3.0")


class CheckChangelogTests(unittest.TestCase):
    def test_new_entry_under_unreleased_counts(self):
        head = MAIN.replace("- bug\n", "- bug\n- another bug\n")
        self.assertEqual(check_changelog.new_entries(MAIN, head), {"- another bug"})

    def test_no_change_or_change_elsewhere_does_not_count(self):
        self.assertEqual(check_changelog.new_entries(MAIN, MAIN), set())
        elsewhere = MAIN.replace("- new\n", "- new\n- old version edited\n")
        self.assertEqual(check_changelog.new_entries(MAIN, elsewhere), set())
        heading_only = MAIN.replace("### Fixed", "### Fixed\n\n### Changed")
        self.assertEqual(check_changelog.new_entries(MAIN, heading_only), set())

    def test_missing_unreleased_has_no_entries(self):
        self.assertEqual(check_changelog.unreleased_entries("# Changelog\n"), set())


if __name__ == "__main__":
    unittest.main()
