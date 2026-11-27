import SnapshotTesting
import SwiftUI
import XCTest
@testable import Stellwall

/**
 * Pictures of screens on the iPhone 17 simulator at 1x text size. A missing picture is recorded
 * and the test fails once; CI uploads the new pictures, which are then committed.
 */
@MainActor
func snap<V: View>(_ view: V, world: String = "flieder", dark: Bool = false, text: UIContentSizeCategory = .large, named name: String, file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
    let host = UIHostingController(rootView: view.themed(world: world, dark: dark))
    host.overrideUserInterfaceStyle = dark ? .dark : .light
    assertSnapshot(
        of: host,
        // Drawn from the window, as on screen: layer rendering draws stray marks at the ends of round chips.
        // The window capture shifts colours slightly (sRGB 0,101,51 comes out as 42,99,56); WorldsTests checks the exact values.
        as: .image(drawHierarchyInKeyWindow: true, precision: 0.99, perceptualPrecision: 0.98, size: CGSize(width: 390, height: 844), traits: UITraitCollection(preferredContentSizeCategory: text)),
        named: name, file: file, testName: testName, line: line
    )
}
