package app.stellwall

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.stellwall.theme.Fredoka
import app.stellwall.theme.LocalPalette
import app.stellwall.theme.oklch
import androidx.compose.ui.graphics.luminance
import app.stellwall.ui.Icons

/** The five areas, in the same order as the web app's tab bar. */
enum class Tab(val label: String) { Start("Start"), Einkauf("Einkauf"), Kalender("Kalender"), Essen("Essen"), Todos("To-dos") }

@Composable
fun AppShell() {
    var tab by rememberSaveable { mutableStateOf(Tab.Start) }
    val p = LocalPalette.current
    Scaffold(
        containerColor = p.ground,
        bottomBar = {
            NavigationBar(containerColor = p.surface) {
                for (t in Tab.entries) {
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(Icons.forTab(t), contentDescription = null) },
                        label = { Text(t.label) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = p.field, selectedIconColor = p.ink, selectedTextColor = p.ink, unselectedIconColor = p.inkSoft, unselectedTextColor = p.inkSoft),
                    )
                }
            }
        },
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner)) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 20.dp)) {
                if (tab == Tab.Start) Wordmark()
                Text(tab.label, style = MaterialTheme.typography.headlineMedium, color = p.ink, modifier = Modifier.padding(top = 14.dp))
            }
        }
    }
}

/** "stellwall" in round letters, its four l in the family colours, as in the web app. */
@Composable
fun Wordmark(size: Int = 22) {
    val p = LocalPalette.current
    // On a dark ground the four family colours need their light variants, as in the web app.
    val dark = p.ground.luminance() < 0.5f
    val l = if (dark) {
        listOf(oklch(0.84f, 0.1f, 155f), oklch(0.82f, 0.1f, 300f), oklch(0.85f, 0.1f, 50f), oklch(0.84f, 0.09f, 235f))
    } else {
        listOf(oklch(0.56f, 0.12f, 155f), oklch(0.54f, 0.14f, 300f), oklch(0.66f, 0.15f, 45f), oklch(0.55f, 0.12f, 235f))
    }
    val text = buildAnnotatedString {
        append("ste")
        withStyle(SpanStyle(color = l[0])) { append("l") }
        withStyle(SpanStyle(color = l[1])) { append("l") }
        append("wa")
        withStyle(SpanStyle(color = l[2])) { append("l") }
        withStyle(SpanStyle(color = l[3])) { append("l") }
    }
    Text(text, fontFamily = Fredoka, fontSize = size.sp, color = p.ink, modifier = Modifier.semantics { contentDescription = "Stellwall" })
}
