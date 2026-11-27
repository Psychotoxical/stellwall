import SwiftUI
import UIKit

/** A colour in sRGB (0...1), from OKLCH as the browser reads it. */
struct RGB: Equatable {
    let r: Double
    let g: Double
    let b: Double

    var color: Color { Color(.sRGB, red: r, green: g, blue: b, opacity: 1) }
    var uiColor: UIColor { UIColor(red: r, green: g, blue: b, alpha: 1) }

    /** Relative luminance as WCAG defines it. */
    var luminance: Double {
        func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    func contrast(_ other: RGB) -> Double {
        let a = luminance + 0.05, b = other.luminance + 0.05
        return max(a, b) / min(a, b)
    }
}

/** OKLCH (lightness 0...1, chroma, hue in degrees) to sRGB, clamped to the screen's colours. */
func oklch(_ l: Double, _ c: Double, _ h: Double) -> RGB {
    let hr = h * .pi / 180
    let a = c * cos(hr), b = c * sin(hr)
    let l_ = l + 0.3963377774 * a + 0.2158037573 * b
    let m_ = l - 0.1055613458 * a - 0.0638541728 * b
    let s_ = l - 0.0894841775 * a - 1.2914855480 * b
    let L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_
    let rl = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
    let gl = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
    let bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S
    func gamma(_ x: Double) -> Double {
        let v = x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1 / 2.4) - 0.055
        return min(1, max(0, v))
    }
    return RGB(r: gamma(rl), g: gamma(gl), b: gamma(bl))
}

/** The same roles as the web app's CSS tokens; values come from the generated WORLDS. */
struct Palette: Equatable {
    let ground, surface, field, rule, ink, inkSoft: RGB
    let board, boardInk, boardSoft, boardRule: RGB
    let change, changeSoft, changeInk: RGB
    let primary, primaryInk, accent: RGB

    /** A date running out: the change tone, dark on light grounds and light on dark ones, so it stays readable. */
    var warn: RGB { ground.luminance < 0.18 ? change : changeInk }

    static func of(world: String, dark: Bool) -> Palette {
        let w = WORLDS[world] ?? WORLDS["flieder"]!
        return dark ? w.dark : w.light
    }
}

struct WorldPalettes: Equatable {
    let light: Palette
    let dark: Palette
}

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = Palette.of(world: "flieder", dark: false)
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

/** Light or dark as the system has it, or fixed; the same three choices as web and Android. */
enum ThemeChoice: String, CaseIterable {
    case system, light, dark

    var label: String {
        switch self {
        case .system: "Wie das System"
        case .light: "Hell"
        case .dark: "Dunkel"
        }
    }

    func isDark(system: Bool) -> Bool {
        switch self {
        case .system: system
        case .light: false
        case .dark: true
        }
    }
}

/** Gives everything below the person's colour world, light or dark. */
struct Themed: ViewModifier {
    let world: String
    let dark: Bool
    /** Set when the person chose light or dark; nil follows the system. */
    let scheme: ColorScheme?

    func body(content: Content) -> some View {
        let p = Palette.of(world: world, dark: dark)
        content
            .environment(\.palette, p)
            .tint(p.primary.color)
            .foregroundStyle(p.ink.color)
            .preferredColorScheme(scheme)
    }
}

extension View {
    func themed(world: String, dark: Bool) -> some View { modifier(Themed(world: world, dark: dark, scheme: dark ? .dark : .light)) }
    func themed(world: String, choice: ThemeChoice, system: ColorScheme) -> some View {
        let forced: ColorScheme? = choice == .system ? nil : (choice == .dark ? .dark : .light)
        return modifier(Themed(world: world, dark: choice.isDark(system: system == .dark), scheme: forced))
    }
}
