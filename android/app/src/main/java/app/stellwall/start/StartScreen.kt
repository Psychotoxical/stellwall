package app.stellwall.start

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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

/** Where a tap on Start leads. */
data class Target(val tab: Tab, val listId: String? = null, val date: java.time.LocalDate? = null, val birthdays: Boolean = false)

private data class Area(val label: String, val icon: Int, val target: Target?)

private val AREAS = listOf(
    Area("Einkauf", Icons.CART, Target(Tab.Einkauf)),
    Area("To-dos", Icons.TODOS, Target(Tab.Todos)),
    Area("Kalender", Icons.CALENDAR, Target(Tab.Kalender)),
    Area("Geburtstage", Icons.CAKE, Target(Tab.Kalender, birthdays = true)),
    Area("Dokumente", Icons.DOCUMENTS, null),
    Area("Essensplan", Icons.MEALS, Target(Tab.Essen)),
)

@Composable
fun StartScreen(member: Member, model: StartModel, live: Flow<LiveEvent> = emptyFlow(), today: LocalDate = LocalDate.now(), onOpen: (Target) -> Unit) {
    val rows by model.rows.collectAsStateWithLifecycle()
    LaunchedEffect(model) { model.load() }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 16.dp)) {
        Wordmark(size = 22)
        Column(Modifier.padding(top = 14.dp)) { PageHead(title = StartText.hello(member.displayName), sub = StartText.today(today)) }
        Board(rows.orEmpty(), onOpen)
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

@Composable
private fun Board(rows: List<BoardRow>, onOpen: (Target) -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().clip(RadiusMd).background(p.board).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text(StartText.BOARD, style = MaterialTheme.typography.titleLarge.copy(fontSize = 19.sp), color = p.boardInk, modifier = Modifier.weight(1f).semantics { heading() })
            Text(StartText.count(rows.size), style = MaterialTheme.typography.bodySmall, color = p.boardSoft)
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
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(target) }.padding(vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(StartText.time(r.latestAt), style = MaterialTheme.typography.titleMedium, color = p.boardInk, modifier = Modifier.width(52.dp))
                Column(Modifier.weight(1f)) {
                    Text(StartText.line(r), style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.boardInk)
                    Text(StartText.area(r), style = MaterialTheme.typography.bodySmall, color = p.boardSoft)
                }
                Text(
                    StartText.NEW, style = MaterialTheme.typography.labelMedium.copy(fontSize = 13.sp), color = p.changeInk,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(p.change).padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}
