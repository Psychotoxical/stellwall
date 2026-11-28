import XCTest

/** The real screens on sample data, worked like a person would: taps, swipes, drags. */
final class GestureTests: XCTestCase {
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-test-shopping"]
        app.launch()
        XCTAssertTrue(app.buttons["Milch bearbeiten"].waitForExistence(timeout: 10))
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
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.0)), withVelocity: .fast, thenHoldForDuration: 0)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: title)
        waitForExpectations(timeout: 5)
    }

    /** People grab the window where it is: often on a text field. */
    func testTheEditWindowCanBeSwipedAwayStartingOnATextField() {
        let app = launch()
        app.buttons["Milch bearbeiten"].tap()
        let title = app.staticTexts["Eintrag bearbeiten"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let window = app.windows.firstMatch
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.0)), withVelocity: .fast, thenHoldForDuration: 0)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: title)
        waitForExpectations(timeout: 5)
    }

    /** Someone was typing: the keyboard is up, and the window is pulled down anyway. */
    func testTheEditWindowCanBeSwipedAwayWithTheKeyboardOpen() {
        let app = launch()
        app.buttons["Milch bearbeiten"].tap()
        let title = app.staticTexts["Eintrag bearbeiten"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        app.textFields.firstMatch.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)).press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.0)), withVelocity: .fast, thenHoldForDuration: 0)
        // The first pull may only take the keyboard away; a second one must close the window.
        if title.exists {
            window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)).press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.0)), withVelocity: .fast, thenHoldForDuration: 0)
        }
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: title)
        waitForExpectations(timeout: 5)
    }

    func testARowSwipedLeftIsDeleted() {
        let app = launch()
        app.buttons["Milch bearbeiten"].swipeLeft(velocity: .fast)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["Milch bearbeiten"])
        waitForExpectations(timeout: 5)
    }

    func testARowSwipedRightIsTickedOff() {
        let app = launch()
        app.buttons["Bananen bearbeiten"].swipeRight(velocity: .fast)
        XCTAssertTrue(app.buttons["Bananen wieder offen"].waitForExistence(timeout: 5))
    }
}
