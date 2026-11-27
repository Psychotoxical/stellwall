import XCTest
@testable import Stellwall

final class WorldsTests: XCTestCase {
    func testTheSevenWorldsOfTheWebAppExist() {
        XCTAssertEqual(WORLD_KEYS, ["salbei", "flieder", "pfirsich", "himmel", "rose", "sonne", "pink"])
        XCTAssertEqual(Set(WORLDS.keys), Set(WORLD_KEYS))
    }

    func testButtonsAndTextStayReadableInEveryWorldLightAndDark() {
        for (name, w) in WORLDS {
            for p in [w.light, w.dark] {
                XCTAssertGreaterThanOrEqual(p.primary.contrast(p.primaryInk), 4.5, "\(name) primary")
                XCTAssertGreaterThanOrEqual(p.ink.contrast(p.ground), 7.0, "\(name) ink")
                XCTAssertGreaterThanOrEqual(p.inkSoft.contrast(p.ground), 4.5, "\(name) soft ink")
                XCTAssertGreaterThanOrEqual(p.boardInk.contrast(p.board), 4.5, "\(name) board")
            }
        }
    }

    func testOklchMatchesTheBrowser() {
        // oklch(44% 0.12 155), the Salbei button in the web app: rgb(0, 101, 51)
        let c = oklch(0.44, 0.12, 155)
        XCTAssertEqual(c.r * 255, 0, accuracy: 2)
        XCTAssertEqual(c.g * 255, 101, accuracy: 2)
        XCTAssertEqual(c.b * 255, 51, accuracy: 2)
    }

    func testThemeChoiceFollowsTheSystemOnlyWhenChosen() {
        XCTAssertFalse(ThemeChoice.light.isDark(system: true))
        XCTAssertTrue(ThemeChoice.dark.isDark(system: false))
        XCTAssertTrue(ThemeChoice.system.isDark(system: true))
    }

    func testTheFontsAreInTheApp() {
        for name in ["SofiaSans-Regular", "SofiaSansCondensed-Regular", "Fredoka-Light"] {
            XCTAssertNotNil(UIFont(name: name, size: 17), name)
        }
    }
}
