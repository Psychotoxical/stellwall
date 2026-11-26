package app.stellwall

import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.CalendarApi
import app.stellwall.api.ShoppingApi
import app.stellwall.calendar.BirthdaysModel
import app.stellwall.calendar.CalendarModel
import app.stellwall.calendar.CalendarScreen
import app.stellwall.start.Target
import app.stellwall.shopping.ShoppingModel
import app.stellwall.shopping.ShoppingScreen
import app.stellwall.start.StartModel
import app.stellwall.start.StartScreen
import app.stellwall.theme.Fredoka
import app.stellwall.theme.LocalPalette
import app.stellwall.theme.oklch
import app.stellwall.ui.Icons
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow

/** The five areas, in the same order as the web app's tab bar. */
enum class Tab(val label: String) { Start("Start"), Einkauf("Einkauf"), Kalender("Kalender"), Essen("Essen"), Todos("To-dos") }

/**
 * The signed-in app: tab bar, the live connection while the app is in front, and the areas.
 * Without [api] (previews, the shell test) the areas show only their titles.
 */
@Composable
fun AppShell(member: Member? = null, api: ShoppingApi? = null, calendarApi: CalendarApi? = null, live: Flow<LiveEvent> = emptyFlow(), webUrl: String? = null) {
    var tab by rememberSaveable { mutableStateOf(Tab.Start) }
    var listId by rememberSaveable { mutableStateOf<String?>(null) }
    var calTarget by remember { mutableStateOf<Target?>(null) }
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()

    // One connection for all areas, only while the app is visible.
    val hints = remember { MutableSharedFlow<LiveEvent>(extraBufferCapacity = 32) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(live) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { live.collect { hints.emit(it) } } }

    val start = remember(api) { api?.let { a -> StartModel(board = { a.board() }) } }
    val shopping = remember(api, member) { if (api != null && member != null) ShoppingModel(api, member) else null }
    val calendar = remember(calendarApi, member) { if (calendarApi != null && member != null) CalendarModel(calendarApi, member) else null }
    val birthdays = remember(calendarApi, member) { if (calendarApi != null && member != null) BirthdaysModel(calendarApi, member) else null }

    // Back leads to Start first, as the web app's back buttons do.
    BackHandler(enabled = tab != Tab.Start) { tab = Tab.Start }

    Scaffold(
        containerColor = p.ground,
        bottomBar = {
            NavigationBar(containerColor = p.surface) {
                for (t in Tab.entries) {
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = {
                            tab = t
                            if (t == Tab.Einkauf) listId = null
                            calTarget = null
                        },
                        icon = { Icon(Icons.forTab(t), contentDescription = null) },
                        label = { Text(t.label) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = p.field, selectedIconColor = p.ink, selectedTextColor = p.ink, unselectedIconColor = p.inkSoft, unselectedTextColor = p.inkSoft),
                    )
                }
            }
        },
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner)) {
            when {
                tab == Tab.Start && start != null && member != null -> StartScreen(member, start, hints) { target ->
                    tab = target.tab
                    listId = target.listId
                    calTarget = target
                }
                tab == Tab.Einkauf && shopping != null -> ShoppingScreen(shopping, listId, hints, leaveScope = scope)
                tab == Tab.Kalender && calendar != null && birthdays != null ->
                    // A new key for each jump from Start, so "Geburtstage" and the day open again.
                    androidx.compose.runtime.key(calTarget) { CalendarScreen(calendar, birthdays, hints, calTarget?.date, calTarget?.birthdays == true, webUrl) }
                else -> Column(Modifier.padding(horizontal = 16.dp, vertical = 20.dp)) {
                    if (tab == Tab.Start) Wordmark()
                    if (tab == Tab.Start && member != null) Text("Hallo, ${member.displayName}", style = MaterialTheme.typography.titleMedium, color = p.inkSoft, modifier = Modifier.padding(top = 10.dp))
                    Text(tab.label, style = MaterialTheme.typography.headlineMedium, color = p.ink, modifier = Modifier.padding(top = 14.dp))
                }
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
