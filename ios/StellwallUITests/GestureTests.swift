import XCTest

/** The real screens on sample data, worked like a person would: taps, swipes, drags. */
final class GestureTests: XCTestCase {
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-test-shopping"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Milch"].waitForExistence(timeout: 10))
        return app
    }

    func testTheEditWindowCanBeSwipedAwayFromItsMiddle() {
        let app = launch()
        app.buttons["Milch bearbeiten"].tap()
        let title = app.staticTexts["Eintrag bearbeiten"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        // Grab the window in its middle, as people do, and pull it down.
        let window = app.windows.firstMatch
        let middle = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
        middle.press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.0)), withVelocity: .fast, thenHoldForDuration: 0)
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: title)
        waitForExpectations(timeout: 5)
    }

    func testTheEditWindowCanBeSwipedAwayByItsHandle() {
        let app = launch()
        app.buttons["Milch bearbeiten"].tap()
        let title = app.staticTexts["Eintrag bearbeiten"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.swipeDown(velocity: .fast)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: title)
        waitForExpectations(timeout: 5)
    }

    func testARowSwipedRightIsTickedOff() {
        let app = launch()
        app.staticTexts["Bananen"].swipeRight(velocity: .fast)
        XCTAssertTrue(app.buttons["Bananen wieder offen"].waitForExistence(timeout: 5))
    }
}
