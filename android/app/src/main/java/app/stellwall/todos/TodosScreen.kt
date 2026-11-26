package app.stellwall.todos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.Occurrence
import app.stellwall.api.TodoRule
import app.stellwall.shopping.ShopText
import app.stellwall.shopping.VisibilitySheet
import app.stellwall.shopping.visibilityLabel
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BoxCard
import app.stellwall.ui.DateField
import app.stellwall.ui.Dropdown
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PersonChip
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.RowDivider
import app.stellwall.ui.Sheet
import app.stellwall.ui.TimeField
import app.stellwall.ui.fieldColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch

@Composable
fun TodosScreen(model: TodosModel, live: Flow<LiveEvent> = emptyFlow()) {
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var form by remember { mutableStateOf<Pair<Boolean, TodoRule?>?>(null) }
    LaunchedEffect(model) { model.load() }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        PageHead(TodoText.TITLE, TodoText.PAGE)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (v in TodoView.entries) Seg(v.label, s.view == v) { scope.launch { model.setView(v) } }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Seg(TodoText.MINE, s.mine) { scope.launch { model.setMine(true) } }
            Seg(TodoText.ALL, !s.mine) { scope.launch { model.setMine(false) } }
        }
        PrimaryButton(TodoText.NEW, { form = true to null }, Modifier.fillMaxWidth().padding(vertical = 12.dp))
        s.error?.let { Notice(it, Modifier.padding(bottom = 10.dp)) }
        val list = s.list
        if (list != null && list.isEmpty()) BoxCard { Text(s.view.empty, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(14.dp)) }
        if (!list.isNullOrEmpty()) TodoList(list, s.members, onToggle = { scope.launch { model.toggle(it) } }, onOpen = { o -> scope.launch { model.rule(o.todoId)?.let { form = true to it } } })
    }
    form?.let { (_, rule) -> TodoSheet(model, rule, s.members) { form = null } }
}

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

/** To-dos as rows: what, when, for whom; a box to tick for those that are confirmed or have no date. */
@Composable
fun TodoList(list: List<Occurrence>, members: List<Member>, onToggle: (Occurrence) -> Unit, onOpen: (Occurrence) -> Unit) {
    val p = LocalPalette.current
    BoxCard {
        list.forEachIndexed { n, o ->
            if (n > 0) RowDivider()
            val done = o.done != null
            Row(Modifier.fillMaxWidth().background(if (o.overdue) p.changeSoft else p.surface).padding(end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).heightIn(min = 56.dp).clickable(role = Role.Button, onClick = { onOpen(o) }).padding(start = 14.dp, end = 6.dp, top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.Center) {
                    Text(o.title, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp, textDecoration = if (done) TextDecoration.LineThrough else null), color = if (done) p.inkSoft else p.ink)
                    val parts = listOfNotNull(
                        if (o.overdue) TodoText.OVERDUE else null,
                        TodoText.whenText(o).ifBlank { null },
                        o.done?.let { d -> TodoText.doneBy(members.firstOrNull { it.id == d.by }?.displayName ?: "?") },
                    )
                    if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = if (o.overdue) p.ink else p.inkSoft)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (id in o.assignees) members.firstOrNull { it.id == id }?.let { PersonChip(it.displayName, it.color) }
                }
                if (o.needsConfirm || o.date == null) {
                    Box(
                        Modifier.size(48.dp).toggleable(value = done, role = Role.Checkbox, onValueChange = { onToggle(o) })
                            .semantics { contentDescription = if (done) TodoText.uncheck(o.title) else TodoText.check(o.title) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(Modifier.size(26.dp).clip(RoundedCornerShape(7.dp)).background(if (done) p.ink else p.surface).border(2.dp, if (done) p.ink else p.inkSoft, RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
                            if (done) Canvas(Modifier.size(18.dp)) {
                                val w = size.width / 24f
                                drawLine(p.surface, Offset(6 * w, 12.5f * w), Offset(10 * w, 16.5f * w), strokeWidth = 2.4f * w, cap = StrokeCap.Round)
                                drawLine(p.surface, Offset(10 * w, 16.5f * w), Offset(18 * w, 7.5f * w), strokeWidth = 2.4f * w, cap = StrokeCap.Round)
                            }
                        }
                    }
                } else {
                    Box(Modifier.size(12.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TodoSheet(model: TodosModel, rule: TodoRule?, members: List<Member>, onClose: () -> Unit) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    val meId = model.me.id
    val isCreator = rule == null || rule.createdBy == meId
    var d by remember(rule) { mutableStateOf(TodoDraft.of(rule)) }
    var error by remember { mutableStateOf<String?>(null) }
    var sugg by remember { mutableStateOf<List<String>>(emptyList()) }
    var who by remember { mutableStateOf(false) }
    LaunchedEffect(d.title) {
        if (rule != null) return@LaunchedEffect
        delay(120)
        sugg = model.suggestions(d.title)
    }
    if (who) {
        VisibilitySheet(lead = d.title, value = d.visibility, members = members, meId = meId, readOnly = false, onClose = { who = false }) { d = d.copy(visibility = it); who = false }
        return
    }
    Sheet(if (rule != null) TodoText.EDIT else TodoText.NEW, onClose) {
        OutlinedTextField(
            d.title, { d = d.copy(title = it.take(80)) }, Modifier.fillMaxWidth(), label = { Text(TodoText.WHAT) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        if (sugg.isNotEmpty()) BoxCard {
            sugg.forEachIndexed { n, sg ->
                if (n > 0) RowDivider()
                Text(sg, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { d = d.copy(title = sg); sugg = emptyList() }.padding(horizontal = 14.dp, vertical = 12.dp))
            }
        }
        Text(TodoText.ASSIGNEES, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (m in members) {
                val on = m.id in d.assignees
                Row(
                    Modifier.clip(RadiusSm).background(p.field).toggleable(value = on, role = Role.Checkbox) { d = d.copy(assignees = if (it) d.assignees + m.id else d.assignees - m.id) }.padding(end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                    PersonChip(m.displayName, m.color)
                    Text(m.displayName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = p.ink, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
        if (isCreator) {
            Row(
                Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(p.surface).border(1.dp, p.rule, RoundedCornerShape(50))
                    .clickable(role = Role.Button) { who = true }.padding(start = 9.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.vector(Icons.MEMBERS), contentDescription = null, tint = p.ink, modifier = Modifier.size(20.dp))
                Text(ShopText.see(visibilityLabel(d.visibility, members, meId)), style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp), color = p.ink)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DateField(TodoText.DATE, d.startDate, Modifier.weight(1f), empty = TodoText.NO_DATE, onClear = { d = d.copy(startDate = null) }) { d = d.copy(startDate = it) }
            TimeField(TodoText.TIME, d.time, Modifier.weight(1f), empty = TodoText.NO_TIME, onClear = { d = d.copy(time = null) }) { d = d.copy(time = it) }
        }
        Dropdown(TodoText.REPEAT, TodoText.REPEATS.first { it.first == d.repeat }.second, TodoText.REPEATS.map { it.second }, Modifier.fillMaxWidth()) { d = d.copy(repeat = TodoText.REPEATS[it].first) }
        if (d.repeat == "weekly") {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TodoText.WEEKDAYS.forEachIndexed { i, w ->
                    val on = (i + 1) in d.weekdays
                    Box(
                        Modifier.weight(1f).heightIn(min = 44.dp).clip(RadiusSm).background(if (on) p.primary else p.field)
                            .toggleable(value = on, role = Role.Checkbox) { d = d.copy(weekdays = if (it) d.weekdays + (i + 1) else d.weekdays - (i + 1)) },
                        contentAlignment = Alignment.Center,
                    ) { Text(w, style = MaterialTheme.typography.labelLarge, color = if (on) p.primaryInk else p.ink) }
                }
            }
        }
        if (d.repeat != "none") DateField(TodoText.UNTIL, d.until, Modifier.fillMaxWidth(), empty = TodoText.UNTIL, onClear = { d = d.copy(until = null) }) { d = d.copy(until = it) }
        Row(
            Modifier.fillMaxWidth().clip(RadiusSm).border(1.5.dp, p.rule, RadiusSm).toggleable(value = d.needsConfirm, role = Role.Checkbox) { d = d.copy(needsConfirm = it) }.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = d.needsConfirm, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
            Column(Modifier.padding(start = 8.dp)) {
                Text(TodoText.NEEDS_CONFIRM, style = MaterialTheme.typography.labelLarge, color = p.ink)
                Text(TodoText.NEEDS_CONFIRM_SUB, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
            }
        }
        Text(TodoText.REMINDERS, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((min, label) in TodoText.REMINDER_CHIPS) {
                val on = min in d.reminders
                Row(
                    Modifier.clip(RadiusSm).background(p.field).toggleable(value = on, role = Role.Checkbox) { d = d.copy(reminders = if (it) d.reminders + min else d.reminders - min) }.padding(end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                    Text(label, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.padding(start = 4.dp))
                }
            }
        }
        Text(TodoText.REMINDER_LATER, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
        error?.let { Notice(it) }
        PrimaryButton(TodoText.SAVE, { scope.launch { error = model.save(rule, d); if (error == null) onClose() } }, Modifier.fillMaxWidth())
        GhostButton(TodoText.CANCEL, onClose, Modifier.fillMaxWidth())
        if (rule != null && isCreator) GhostButton(TodoText.DELETE, { scope.launch { model.delete(rule); onClose() } }, Modifier.fillMaxWidth(), danger = true)
    }
}
