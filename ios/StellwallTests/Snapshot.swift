import SnapshotTesting
import SwiftUI
import XCTest
@testable import Stellwall

/**
 * Pictures of screens on the iPhone 17 simulator at 1x text size. A missing picture is recorded
 * and the test fails once; CI uploads the new pictures, which are then committed.
 */
@MainActor
func snap<V: View>(_ view: V, world: String = "flieder", dark: Bool = false, named name: String, file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
    let host = UIHostingController(rootView: view.themed(world: world, dark: dark))
    host.overrideUserInterfaceStyle = dark ? .dark : .light
    assertSnapshot(
        of: host,
        as: .image(on: .iPhone13, precision: 0.99, perceptualPrecision: 0.98, traits: UITraitCollection(preferredContentSizeCategory: .large)),
        named: name, file: file, testName: testName, line: line
    )
}
