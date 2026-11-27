package app.stellwall.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.stellwall.R
import kotlin.math.cos
import kotlin.math.sin

/** The same roles as the web app's CSS tokens; values come from the generated [WORLDS]. */
@Immutable
data class Palette(
    val ground: Color,
    val surface: Color,
    val field: Color,
    val rule: Color,
    val ink: Color,
    val inkSoft: Color,
    val board: Color,
    val boardInk: Color,
    val boardSoft: Color,
    val boardRule: Color,
    val change: Color,
    val changeSoft: Color,
    val changeInk: Color,
    val primary: Color,
    val primaryInk: Color,
    val accent: Color,
)

data class WorldPalettes(val light: Palette, val dark: Palette)

/** OKLCH as the browser reads it (lightness 0..1, chroma, hue in degrees), converted to sRGB. */
fun oklch(l: Float, c: Float, hDegrees: Float): Color {
    val h = Math.toRadians(hDegrees.toDouble())
    return Color(l, (c * cos(h)).toFloat(), (c * sin(h)).toFloat(), 1f, ColorSpaces.Oklab).convert(ColorSpaces.Srgb)
}

private fun weight(w: Int) = FontVariation.Settings(FontVariation.weight(w))

val SofiaSans = FontFamily(
    Font(R.font.sofia_sans, FontWeight.Normal, variationSettings = weight(400)),
    Font(R.font.sofia_sans, FontWeight.SemiBold, variationSettings = weight(600)),
    Font(R.font.sofia_sans, FontWeight.Bold, variationSettings = weight(700)),
)
val SofiaSansCondensed = FontFamily(Font(R.font.sofia_sans_condensed, FontWeight.ExtraBold, variationSettings = weight(800)))
val Fredoka = FontFamily(Font(R.font.fredoka, FontWeight.Bold, variationSettings = weight(700)))

val LocalPalette = staticCompositionLocalOf { WORLDS.getValue("flieder").light }

/** Gives everything below the person's colour world, light or dark. */
@Composable
fun StellwallTheme(world: String, dark: Boolean, content: @Composable () -> Unit) {
    val worlds = WORLDS[world] ?: WORLDS.getValue("flieder")
    val p = if (dark) worlds.dark else worlds.light
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = p.primary,
        onPrimary = p.primaryInk,
        background = p.ground,
        onBackground = p.ink,
        surface = p.surface,
        onSurface = p.ink,
        surfaceVariant = p.field,
        onSurfaceVariant = p.inkSoft,
        surfaceContainer = p.surface,
        secondaryContainer = p.field,
        onSecondaryContainer = p.ink,
        outline = p.rule,
        outlineVariant = p.rule,
    )
    val body = TextStyle(fontFamily = SofiaSans, fontSize = 16.sp, lineHeight = 23.sp)
    val board = TextStyle(fontFamily = SofiaSansCondensed, fontWeight = FontWeight.ExtraBold)
    val type = Typography(
        headlineMedium = board.copy(fontSize = 30.sp, lineHeight = 33.sp),
        titleLarge = board.copy(fontSize = 21.sp),
        titleMedium = board.copy(fontSize = 18.sp),
        bodyLarge = body,
        bodyMedium = body.copy(fontSize = 15.sp),
        bodySmall = body.copy(fontSize = 14.sp),
        labelLarge = body.copy(fontWeight = FontWeight.Bold, fontSize = 15.sp),
        labelMedium = body.copy(fontWeight = FontWeight.SemiBold, fontSize = 12.sp),
    )
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, typography = type, content = content)
    }
}
