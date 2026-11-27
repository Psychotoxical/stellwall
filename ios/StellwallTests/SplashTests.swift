import XCTest
@testable import Stellwall

@MainActor
final class SplashTests: XCTestCase {
    func testTheWordmarkOnTheGroundLightAndDark() {
        snap(SplashView(), world: "salbei", named: "light")
        snap(SplashView(), world: "pink", dark: true, named: "pink-dark")
    }
}
