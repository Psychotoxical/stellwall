package app.stellwall.start

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.Tab
import app.stellwall.Wordmark
import app.stellwall.api.BoardRow
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BoxCard
import app.stellwall.ui.Icons
import app.stellwall.ui.PageHead
import app.stellwall.ui.RadiusMd
import app.stellwall.ui.RowDivider
import app.stellwall.ui.SectionHead
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import app.stellwall.ui.RefreshPage

/** Where a tap on Start leads. */
data class Target(val tab: Tab, val listId: String? = null, val date: java.time.LocalDate? = null, val birthdays: Boolean = false, val cook: app.stellwall.meals.MealPage.Cook? = null, val more: Boolean = false, val documents: Boolean = false, val documentId: String? = null)

private data class Area(val label: String, val icon: Int, val target: Target?)

private val AREAS = listOf(
    Area("Einkauf", Icons.CART, Target(Tab.Einkauf)),
    Area("To-dos", Icons.TODOS, Target(Tab.Todos)),
    Area("Kalender", Icons.CALENDAR, Target(Tab.Kalender)),
    Area("Geburtstage", Icons.CAKE, Target(Tab.Kalender, birthdays = true)),
    Area("Dokumente", Icons.DOCUMENTS, Target(Tab.Start, documents = true)),
    Area("Essensplan", Icons.MEALS, Target(Tab.Essen)),
)

@Composable
fun StartScreen(
    member: Member,
    model: StartModel,
    live: Flow<LiveEvent> = emptyFlow(),
    today: LocalDate = LocalDate.now(),
    hour: Int = java.time.LocalTime.now().hour,
    mine: TodayModel? = null,
    onMore: (() -> Unit)? = null,
    banner: @Composable () -> Unit = {},
    onOpen: (Target) -> Unit,
) {
    val rows by model.rows.collectAsStateWithLifecycle()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    LaunchedEffect(model) { model.load() }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    if (mine != null) {
        LaunchedEffect(mine) { mine.load() }
        LaunchedEffect(mine, live) { live.collect { mine.onLive(it) } }
    }
    val p = LocalPalette.current
    RefreshPage({ model.load() }) {
        Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Wordmark(size = 22) }
            // The round picture top right leads to Mehr, as in the web app.
            if (onMore != null) {
                Box(
                    Modifier.size(48.dp).clip(androidx.compose.foundation.shape.CircleShape).background(app.stellwall.ui.PersonColors.of(member.color))
                        .clickable(role = Role.Button, onClick = onMore).semantics { contentDescription = "Mehr" },
                    contentAlignment = Alignment.Center,
                ) { Text(member.displayName.take(1).uppercase(), color = app.stellwall.ui.PersonColors.INK, style = MaterialTheme.typography.titleMedium) }
            }
        }
        Column(Modifier.padding(top = 14.dp)) { PageHead(title = StartText.hello(member.displayName, hour), sub = StartText.today(today)) }
        banner()
        Box(Modifier.padding(top = 10.dp)) { Board(rows.orEmpty(), onOpen, onSeen = { r -> scope.launch { model.seen(r) } }, onSeenAll = { scope.launch { model.seenEverything() } }) }
        if (mine != null) MyToday(mine, today, onOpen)
        SectionHead(StartText.AREAS)
        BoxCard {
            AREAS.forEachIndexed { i, a ->
                if (i > 0) RowDivider()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp)
                        .then(if (a.target != null) Modifier.clickable(role = Role.Button) { onOpen(a.target) } else Modifier)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val tint = if (a.target != null) p.ink else p.inkSoft
                    Icon(Icons.vector(a.icon), contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
                    Text(a.label, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = tint, modifier = Modifier.weight(1f))
                    if (a.target == null) Text(StartText.SOON, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                }
            }
        }
    }
    }
}

@Composable
private fun Board(rows: List<BoardRow>, onOpen: (Target) -> Unit, onSeen: (BoardRow) -> Unit, onSeenAll: () -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().clip(RadiusMd).background(p.board).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(StartText.BOARD, style = MaterialTheme.typography.titleLarge.copy(fontSize = 19.sp), color = p.boardInk, modifier = Modifier.weight(1f).semantics { heading() })
            if (rows.isEmpty()) Text(StartText.count(0), style = MaterialTheme.typography.bodySmall, color = p.boardSoft)
            else BoardChip(StartText.SEEN_ALL, StartText.SEEN_ALL, soft = true, onClick = onSeenAll)
        }
        HorizontalDivider(color = p.boardRule)
        if (rows.isEmpty()) Text(StartText.BOARD_EMPTY, style = MaterialTheme.typography.bodyLarge, color = p.boardSoft, modifier = Modifier.padding(top = 12.dp, bottom = 2.dp))
        rows.forEachIndexed { i, r ->
            if (i > 0) HorizontalDivider(color = p.boardRule)
            val target = when (r) {
                is BoardRow.Shopping -> Target(Tab.Einkauf, r.listId)
                is BoardRow.Todo -> Target(Tab.Todos)
                is BoardRow.Event -> Target(Tab.Kalender, date = java.time.Instant.parse(r.start).atZone(java.time.ZoneId.systemDefault()).toLocalDate())
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    Modifier.weight(1f).clickable(role = Role.Button) { onOpen(target) }.padding(vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(StartText.time(r.latestAt), style = MaterialTheme.typography.titleMedium, color = p.boardInk, modifier = Modifier.width(52.dp))
                    Column(Modifier.weight(1f)) {
                        Text(StartText.line(r), style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.boardInk)
                        Text(StartText.area(r), style = MaterialTheme.typography.bodySmall, color = p.boardSoft)
                    }
                }
                // A tick, not a word: on a small phone the line itself needs the room.
                BoardChip("✓", StartText.seenLabel(StartText.line(r)), soft = false, round = true) { onSeen(r) }
            }
        }
    }
}


/** A small round button on the board: "Gesehen" on a line, "Alle gesehen" at the top. */
@Composable
private fun BoardChip(text: String, label: String, soft: Boolean, round: Boolean = false, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier.heightIn(min = 44.dp).then(if (round) Modifier.size(44.dp) else Modifier).clip(RoundedCornerShape(50)).border(1.dp, p.boardRule, RoundedCornerShape(50))
            .clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label }.padding(horizontal = if (round) 0.dp else 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = MaterialTheme.typography.labelMedium.copy(fontSize = if (round) 20.sp else 14.sp), color = if (soft) p.boardSoft else p.boardInk) }
}

@Composable
private fun MyToday(model: TodayModel, today: LocalDate, onOpen: (Target) -> Unit) {
    val t by model.state.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    SectionHead(app.stellwall.todos.TodoText.MY_TODAY)
    val lunch = t.lunch
    if (lunch != null) {
        val what = lunch.recipe?.name ?: lunch.text.orEmpty()
        BoxCard(Modifier.padding(bottom = 10.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) {
                    onOpen(Target(Tab.Essen, cook = lunch.recipe?.let { app.stellwall.meals.MealPage.Cook(it.slug, lunch.servings, today) }))
                }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.vector(Icons.MEALS), contentDescription = null, tint = p.ink, modifier = Modifier.size(28.dp))
                Text(app.stellwall.meals.MealText.todayLunch(what), style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink)
            }
        }
    }
    if (t.events.isNotEmpty()) {
        Box(Modifier.padding(bottom = 10.dp)) {
            app.stellwall.calendar.CalList(t.events, today, t.members, java.time.ZoneId.systemDefault()) { i ->
                onOpen(if (i is app.stellwall.api.CalendarInstance.Birthday) Target(Tab.Kalender, birthdays = true) else Target(Tab.Kalender, date = today))
            }
        }
    }
    when {
        t.todos.isNotEmpty() -> app.stellwall.todos.TodoList(t.todos, t.members, onToggle = { o -> scope.launch { model.toggle(o) } }, onOpen = { onOpen(Target(Tab.Todos)) })
        t.loaded && t.events.isEmpty() && lunch == null -> BoxCard {
            Text(app.stellwall.todos.TodoText.MY_TODAY_EMPTY, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(14.dp))
        }
    }
}
