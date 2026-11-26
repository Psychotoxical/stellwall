package app.stellwall.calendar

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.CalendarInstance
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BoxCard
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PersonChip
import app.stellwall.ui.PersonColors
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RowDivider
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch

/**
 * The calendar: month grid with the chosen day, a week as agenda, or the next 30 days.
 * [webUrl] is the server's address; the import still lives in the browser.
 */
@Composable
fun CalendarScreen(
    model: CalendarModel,
    birthdays: BirthdaysModel,
    live: Flow<LiveEvent> = emptyFlow(),
    openDate: LocalDate? = null,
    openBirthdays: Boolean = false,
    webUrl: String? = null,
) {
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var form by remember { mutableStateOf<EventForm?>(null) }
    var showBirthdays by rememberSaveable { mutableStateOf(openBirthdays) }
    LaunchedEffect(model, openDate) { if (openDate != null) model.select(openDate); model.load() }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    val zone = remember { ZoneId.systemDefault() }

    if (showBirthdays) {
        BackHandler { showBirthdays = false }
        BirthdaysScreen(birthdays, onBack = { showBirthdays = false; scope.launch { model.load() } })
        return
    }

    val p = LocalPalette.current
    val open = { i: CalendarInstance ->
        when (i) {
            is CalendarInstance.Birthday -> showBirthdays = true
            is CalendarInstance.Event -> scope.launch { form = model.open(i) }
        }
        Unit
    }
    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        PageHead(title = s.title, sub = CalText.PAGE)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (v in View.entries) Seg(v.label, s.view == v) { scope.launch { model.setView(v) } }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Seg(CalText.MINE, s.mine) { scope.launch { model.setMine(true) } }
            Seg(CalText.ALL, !s.mine) { scope.launch { model.setMine(false) } }
            Box(Modifier.weight(1f))
            if (s.view != View.Upcoming) {
                Chevron(left = true, CalText.PREV) { scope.launch { model.step(-1) } }
                Seg(CalText.TODAY, false) { scope.launch { model.goToday() } }
                Chevron(left = false, CalText.NEXT) { scope.launch { model.step(1) } }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            PrimaryButton(CalText.NEW, { form = model.new(s.sel) }, Modifier.weight(1f))
            Row(
                Modifier.heightIn(min = 52.dp).clip(RoundedCornerShape(14.dp)).background(p.surface).border(1.dp, p.rule, RoundedCornerShape(14.dp))
                    .clickable(role = Role.Button) { showBirthdays = true }.padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.vector(Icons.CAKE), contentDescription = null, tint = p.ink, modifier = Modifier.size(20.dp))
                Text(CalText.BIRTHDAYS, style = MaterialTheme.typography.labelLarge, color = p.ink)
            }
        }
        s.error?.let { Notice(it, Modifier.padding(bottom = 10.dp)) }

        when (s.view) {
            View.Month -> {
                MonthGrid(s, zone) { d -> scope.launch { model.select(d) } }
                Text(head(s.sel, s.today), style = MaterialTheme.typography.titleLarge, color = p.ink, modifier = Modifier.padding(top = 18.dp, bottom = 10.dp).semantics { heading() })
                val list = s.days[s.sel].orEmpty()
                if (list.isEmpty()) Empty(CalText.DAY_EMPTY) else CalList(list, s.sel, s.members, zone, open)
            }
            View.Week -> {
                val (from, _) = s.range
                val week = (0L until 7L).map { from.plusDays(it) }
                for (d in week) AgendaDay(d, s.today, s.days[d].orEmpty(), s.members, zone, withMonth = false, open)
                if (s.loaded && week.all { s.days[it].isNullOrEmpty() }) Empty(CalText.WEEK_EMPTY)
            }
            View.Upcoming -> {
                val (from, to) = s.range
                val keys = s.days.keys.filter { !it.isBefore(from) && it.isBefore(to) }.sorted()
                for (d in keys) AgendaDay(d, s.today, s.days.getValue(d), s.members, zone, withMonth = true, open)
                if (s.loaded && keys.isEmpty()) Empty(CalText.UPCOMING_EMPTY)
            }
        }

        if (webUrl != null) {
            val uri = LocalUriHandler.current
            BoxCard(Modifier.padding(top = 22.dp)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) { uri.openUri(webUrl.trimEnd('/') + "/kalender/import") }.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(Icons.vector(Icons.CALENDAR), contentDescription = null, tint = p.ink, modifier = Modifier.size(28.dp))
                    Text(CalText.IMPORT, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink, modifier = Modifier.weight(1f))
                    Text("↗", color = p.inkSoft)
                }
            }
        }
    }

    form?.let { f ->
        EventSheet(f, s.members, model.me.id, onClose = { form = null }, onSave = { d, sc -> model.save(f, d, sc).also { if (it == null) form = null } }, onDelete = { sc ->
            model.delete(f, sc).also { if (it == null) form = null }
        })
    }
}

private fun head(d: LocalDate, today: LocalDate) = (if (d == today) CalText.TODAY + ", " else "") + Days.dayLabel(d)

@Composable
private fun Seg(text: String, on: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(if (on) p.surface else p.field)
            .border(1.dp, if (on) p.primary else p.field, RoundedCornerShape(50))
            .selectable(selected = on, role = Role.Tab, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = MaterialTheme.typography.labelLarge, color = p.ink) }
}

@Composable
private fun Chevron(left: Boolean, label: String, onClick: () -> Unit) {
    val p = LocalPalette.current
    IconButton(onClick = onClick, modifier = Modifier.size(44.dp).semantics { contentDescription = label }) {
        Text(if (left) "‹" else "›", style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp), color = p.ink)
    }
}

private fun colorOf(i: CalendarInstance, members: List<Member>, change: Color): Color = when (i) {
    is CalendarInstance.Birthday -> change
    is CalendarInstance.Event -> PersonColors.of(members.firstOrNull { it.id == i.forWhom.firstOrNull() }?.color)
}

@Composable
private fun MonthGrid(s: CalState, zone: ZoneId, onPick: (LocalDate) -> Unit) {
    val p = LocalPalette.current
    val start = s.range.first
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.surface).border(1.dp, p.rule, RoundedCornerShape(16.dp)).padding(6.dp)) {
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }) {
            for (w in CalText.WEEKDAYS) Text(w, Modifier.weight(1f).padding(vertical = 4.dp), color = p.inkSoft, style = MaterialTheme.typography.labelMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        for (week in 0 until 6) {
            Row(Modifier.fillMaxWidth()) {
                for (day in 0 until 7) {
                    val d = start.plusDays((week * 7 + day).toLong())
                    val list = s.days[d].orEmpty()
                    val sel = d == s.sel
                    val out = d.month != s.sel.month
                    Column(
                        Modifier.weight(1f).aspectRatio(0.9f).padding(2.dp).clip(RoundedCornerShape(10.dp))
                            .background(if (sel) p.field else Color.Transparent)
                            .border(if (sel) 1.5.dp else 0.dp, if (sel) p.primary else Color.Transparent, RoundedCornerShape(10.dp))
                            .selectable(selected = sel, role = Role.Button) { onPick(d) }
                            .semantics { contentDescription = Days.dayLabel(d) + if (list.isNotEmpty()) ", ${list.size}" else "" },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        val today = d == s.today
                        Box(Modifier.size(30.dp).clip(CircleShape).background(if (today) p.primary else Color.Transparent), contentAlignment = Alignment.Center) {
                            Text(
                                "${d.dayOfMonth}", color = when { today -> p.primaryInk; out -> p.inkSoft; else -> p.ink },
                                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = if (today || sel) FontWeight.Bold else FontWeight.Normal),
                            )
                        }
                        Row(Modifier.padding(top = 3.dp).heightIn(min = 8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                            for (i in list.take(3)) Box(Modifier.size(7.dp).clip(CircleShape).background(colorOf(i, s.members, p.change)))
                            if (list.size > 3) Text(CalText.more(list.size - 3), style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp), color = p.inkSoft)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Empty(text: String) {
    BoxCard { Text(text, color = LocalPalette.current.inkSoft, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(14.dp)) }
}

/** One day as an agenda row: a narrow date column, its entries beside it; an empty day stays a thin line. */
@Composable
private fun AgendaDay(d: LocalDate, today: LocalDate, list: List<CalendarInstance>, members: List<Member>, zone: ZoneId, withMonth: Boolean, open: (CalendarInstance) -> Unit) {
    val p = LocalPalette.current
    val isToday = d == today
    Row(Modifier.fillMaxWidth().padding(vertical = if (list.isEmpty()) 2.dp else 6.dp).semantics(mergeDescendants = false) { contentDescription = head(d, today) }, verticalAlignment = Alignment.Top) {
        Column(Modifier.width(48.dp).padding(top = if (list.isEmpty()) 0.dp else 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(Days.weekdayShort(d), style = MaterialTheme.typography.labelMedium, color = if (isToday) p.primary else p.inkSoft)
            Text("${d.dayOfMonth}", style = MaterialTheme.typography.titleLarge.copy(fontSize = if (list.isEmpty()) 16.sp else 21.sp), color = if (isToday) p.primary else if (list.isEmpty()) p.inkSoft else p.ink)
            if (withMonth) Text(Days.monthShort(d), style = MaterialTheme.typography.labelMedium, color = p.inkSoft)
        }
        if (list.isNotEmpty()) Box(Modifier.weight(1f)) { CalList(list, d, members, zone, open) }
        else RowDivider()
    }
}

@Composable
fun CalList(list: List<CalendarInstance>, date: LocalDate, members: List<Member>, zone: ZoneId, open: (CalendarInstance) -> Unit) {
    val p = LocalPalette.current
    BoxCard {
        list.forEachIndexed { n, i ->
            if (n > 0) RowDivider()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) { open(i) }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.width(64.dp)) {
                    if (i is CalendarInstance.Birthday) Icon(Icons.vector(Icons.CAKE), contentDescription = CalText.BIRTHDAYS, tint = p.ink, modifier = Modifier.size(24.dp))
                    else Text(
                        if (i.allDay) CalText.ALL_DAY_SHORT else if (Days.dayOf(i, zone) == date) Days.hhmm(i.start, zone) else "…",
                        style = MaterialTheme.typography.titleMedium.copy(fontSize = if (i.allDay) 14.sp else 17.sp), color = p.ink,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(i.title, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    val sub = when (i) {
                        is CalendarInstance.Birthday -> i.age?.let { CalText.turns(it) }
                        is CalendarInstance.Event -> i.location.ifBlank { null }
                    }
                    if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                }
                if (i is CalendarInstance.Event) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (id in i.forWhom) members.firstOrNull { it.id == id }?.let { PersonChip(it.displayName, it.color) }
                }
            }
        }
    }
}
