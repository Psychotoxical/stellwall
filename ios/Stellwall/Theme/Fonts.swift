import SwiftUI
import UIKit

/**
 * The app's three typefaces, the same files as web and Android. They are variable fonts:
 * the weight is set on the font's wght axis, and sizes follow the person's text size (Dynamic Type).
 */
enum Fonts {
    private static let wght = 0x7767_6874 // 'wght'

    static func ui(_ name: String, size: CGFloat, weight: CGFloat, style: UIFont.TextStyle) -> UIFont {
        let base = UIFontDescriptor(fontAttributes: [.name: name])
        let desc = base.addingAttributes([UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wght: weight]])
        let font = UIFont(descriptor: desc, size: size)
        return UIFontMetrics(forTextStyle: style).scaledFont(for: font)
    }

    private static func font(_ name: String, _ size: CGFloat, _ weight: CGFloat, _ style: UIFont.TextStyle) -> Font {
        Font(ui(name, size: size, weight: weight, style: style) as CTFont)
    }

    /** Sofia Sans, the text face. */
    static func body(_ size: CGFloat = 17, weight: CGFloat = 400, style: UIFont.TextStyle = .body) -> Font { font("SofiaSans-Regular", size, weight, style) }
    /** Sofia Sans Condensed Extra Bold, for page titles. */
    static func title(_ size: CGFloat = 32, style: UIFont.TextStyle = .largeTitle) -> Font { font("SofiaSansCondensed-Regular", size, 800, style) }
    /** Fredoka Bold, only for the wordmark. */
    static func wordmark(_ size: CGFloat) -> Font { font("Fredoka-Light", size, 700, .title1) }
}

extension Font {
    static var swBody: Font { Fonts.body() }
    static var swLabel: Font { Fonts.body(16, weight: 600, style: .callout) }
    static var swSmall: Font { Fonts.body(14, style: .footnote) }
    static var swHead: Font { Fonts.title(22, style: .title2) }
    static var swTitle: Font { Fonts.title(34) }
}
