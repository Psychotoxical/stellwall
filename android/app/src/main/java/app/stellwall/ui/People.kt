package app.stellwall.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The person colours of the web app (web/src/theme/tokens.css), the same in light and dark. */
object PersonColors {
    private val colors = mapOf(
        "person-mint" to Color(0xFFA8D8C8),
        "person-lilac" to Color(0xFFC7C0F0),
        "person-peach" to Color(0xFFFFC9A8),
        "person-sky" to Color(0xFFA9D3F0),
    )
    val INK = Color(0xFF1A1F29)
    fun of(name: String?): Color = colors[name] ?: Color(0xFFB4BBC7)
}

/** A person's initial on their colour, as the web app's chip. */
@Composable
fun PersonChip(name: String, color: String) {
    Box(
        Modifier.clip(RoundedCornerShape(6.dp)).background(PersonColors.of(color)).defaultMinSize(minWidth = 26.dp, minHeight = 22.dp).padding(horizontal = 6.dp)
            .semantics { contentDescription = name },
        contentAlignment = Alignment.Center,
    ) {
        Text(name.take(1).uppercase(), color = PersonColors.INK, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.ExtraBold, fontSize = 12.sp))
    }
}
