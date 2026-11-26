package app.stellwall.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.stellwall.theme.LocalPalette
import app.stellwall.theme.Palette

/** Ground and text of an error note: as in the web app (.notice-error), normal ink on the soft change tone. */
fun noticeColors(p: Palette): Pair<Color, Color> = p.changeSoft to p.ink

/** An error note; screen readers announce it when it appears. */
@Composable
fun Notice(text: String, modifier: Modifier = Modifier) {
    val (ground, ink) = noticeColors(LocalPalette.current)
    Text(
        text, color = ink, style = MaterialTheme.typography.bodyLarge,
        modifier = modifier.fillMaxWidth().background(ground, RoundedCornerShape(12.dp)).padding(14.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}
