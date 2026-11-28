package app.stellwall.meals

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle

/** **bold**, __bold__ and *italic*, as Mealie keeps them in steps; lone stars stay text (same rule as shared/src/meals/markdown.ts). */
private val INLINE = Regex("""\*\*(?!\s)(.+?)(?<!\s)\*\*|__(?!\s)(.+?)(?<!\s)__|\*(?![\s*])([^*]*?[^\s*])\*(?!\*)""")

/** A recipe step written in Markdown, with its emphasis shown and the stars gone. */
fun stepText(text: String): AnnotatedString = buildAnnotatedString {
    var at = 0
    for (m in INLINE.findAll(text)) {
        append(text.substring(at, m.range.first))
        val bold = m.groups[1]?.value ?: m.groups[2]?.value
        if (bold != null) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(bold) }
        else withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(m.groups[3]!!.value) }
        at = m.range.last + 1
    }
    append(text.substring(at))
}
