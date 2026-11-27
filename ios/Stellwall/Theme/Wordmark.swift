import SwiftUI

/** "stellwall" with the four l in the family colours, as in the web and Android apps. */
struct Wordmark: View {
    var size: CGFloat = 22
    @Environment(\.palette) private var p

    var body: some View {
        // On a dark ground the four family colours need their light variants.
        let dark = p.ground.luminance < 0.18
        let l = dark
            ? [oklch(0.84, 0.1, 155), oklch(0.82, 0.1, 300), oklch(0.85, 0.1, 50), oklch(0.84, 0.09, 235)]
            : [oklch(0.56, 0.12, 155), oklch(0.54, 0.14, 300), oklch(0.66, 0.15, 45), oklch(0.55, 0.12, 235)]
        var text = AttributedString("ste")
        for (i, part) in ["l", "l", "wa", "l", "l"].enumerated() {
            var a = AttributedString(part)
            switch i {
            case 0: a.foregroundColor = l[0].color
            case 1: a.foregroundColor = l[1].color
            case 3: a.foregroundColor = l[2].color
            case 4: a.foregroundColor = l[3].color
            default: break
            }
            text += a
        }
        return Text(text)
            .font(Fonts.wordmark(size))
            .foregroundStyle(p.ink.color)
            .accessibilityLabel("Stellwall")
    }
}
