package app.stellwall.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.stellwall.api.Member
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Notice
import app.stellwall.ui.PersonChip
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.Sheet
import app.stellwall.ui.DateField
import app.stellwall.ui.TimeField
import app.stellwall.ui.fieldColors
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.launch

/** New or existing event; changing a series asks which occurrences are meant. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventSheet(
    form: EventForm,
    members: List<Member>,
    meId: String,
    onClose: () -> Unit,
    onSave: suspend (EventDraft, Scope?) -> String?,
    onDelete: suspend (Scope) -> String?,
) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var d by remember(form) { mutableStateOf(form.start0) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val ev = form.event
    // People a non-creator may add: only those who can already see it.
    val canPick = { id: String -> form.isCreator || ev == null || ev.seeAll || id in ev.forWhom || ev.createdBy == id }
    val run = { block: suspend () -> String? ->
        scope.launch {
            busy = true
            error = block()
            busy = false
        }
        Unit
    }

    if (ask != null) {
        val which = ask!!
        Sheet(CalText.SCOPE_TITLE, onClose = { ask = null }) {
            Text(if (which == Ask.Delete) CalText.SCOPE_DELETE else CalText.SCOPE_SAVE, style = MaterialTheme.typography.bodyLarge, color = p.ink)
            for (sc in EventForms.scopes(which, form.isCreator, EventForms.seriesOnly(form.start0, d))) {
                val action = { ask = null; run { if (which == Ask.Delete) onDelete(sc) else onSave(d, sc) } }
                if (sc == Scope.One) PrimaryButton(sc.label, action, Modifier.fillMaxWidth(), enabled = !busy)
                else GhostButton(sc.label, action, Modifier.fillMaxWidth())
            }
            GhostButton(CalText.CANCEL, { ask = null }, Modifier.fillMaxWidth())
        }
        return
    }

    Sheet(if (ev != null) CalText.EDIT else CalText.NEW, onClose) {
        OutlinedTextField(
            d.title, { d = d.copy(title = it.take(120)) }, Modifier.fillMaxWidth(), label = { Text(CalText.TITLE) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        Row(
            Modifier.fillMaxWidth().clip(RadiusSm).border(1.5.dp, p.rule, RadiusSm)
                .toggleable(value = d.allDay, role = Role.Switch) { on -> d = d.copy(allDay = on) }.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(CalText.ALL_DAY, style = MaterialTheme.typography.labelLarge, color = p.ink, modifier = Modifier.weight(1f))
            Switch(checked = d.allDay, onCheckedChange = null, colors = SwitchDefaults.colors(checkedTrackColor = p.primary, checkedThumbColor = p.primaryInk))
        }
        Text(CalText.FROM, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DateField(CalText.FROM + " " + CalText.DATE, d.startDate, Modifier.weight(1f)) { new ->
                // The end moves along, so the length stays.
                d = d.copy(startDate = new, endDate = d.endDate.plusDays(ChronoUnit.DAYS.between(d.startDate, new)))
            }
            if (!d.allDay) TimeField(CalText.FROM + " " + CalText.TIME, d.startTime, Modifier.width(110.dp)) { t ->
                val len = java.time.Duration.between(d.startTime, d.endTime)
                d = d.copy(startTime = t, endTime = if (d.startDate == d.endDate && !len.isNegative) t.plus(len) else d.endTime)
            }
        }
        Text(CalText.TO, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DateField(CalText.TO + " " + CalText.DATE, d.endDate, Modifier.weight(1f)) { d = d.copy(endDate = it) }
            if (!d.allDay) TimeField(CalText.TO + " " + CalText.TIME, d.endTime, Modifier.width(110.dp)) { d = d.copy(endTime = it) }
        }

        Text(CalText.FOR_WHOM, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (m in members) {
                val on = m.id in d.forWhom
                val enabled = on || canPick(m.id)
                Row(
                    Modifier.clip(RadiusSm).background(p.field)
                        .toggleable(value = on, enabled = enabled, role = Role.Checkbox) { d = d.copy(forWhom = if (it) d.forWhom + m.id else d.forWhom - m.id) }
                        .padding(end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null, enabled = enabled, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                    PersonChip(m.displayName, m.color)
                    Text(m.displayName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = p.ink, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
        if (form.isCreator) {
            Row(
                Modifier.fillMaxWidth().clip(RadiusSm).border(1.5.dp, p.rule, RadiusSm)
                    .toggleable(value = d.seeAll, role = Role.Checkbox) { d = d.copy(seeAll = it) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = d.seeAll, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                Column(Modifier.padding(start = 8.dp)) {
                    Text(CalText.SEE_ALL, style = MaterialTheme.typography.labelLarge, color = p.ink)
                    Text(CalText.SEE_ALL_SUB, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                }
            }
        }

        RepeatField(d, ev?.rrule) { d = d.copy(repeat = it) }
        OutlinedTextField(d.location, { d = d.copy(location = it.take(200)) }, Modifier.fillMaxWidth(), label = { Text(CalText.LOCATION) }, singleLine = true, colors = fieldColors())
        OutlinedTextField(d.notes, { d = d.copy(notes = it.take(2000)) }, Modifier.fillMaxWidth(), label = { Text(CalText.NOTES) }, minLines = 2, colors = fieldColors())

        Text(CalText.REMINDERS, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((min, label) in CalText.REMINDER_CHIPS) {
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
        Text(CalText.REMINDER_LATER, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)

        error?.let { Notice(it) }
        PrimaryButton(CalText.SAVE, {
            val v = EventForms.validate(d)
            when {
                v != null -> error = v
                ev != null && form.isSeries -> ask = Ask.Save
                else -> run { onSave(d, null) }
            }
        }, Modifier.fillMaxWidth(), enabled = !busy)
        GhostButton(CalText.CANCEL, onClose, Modifier.fillMaxWidth())
        if (ev != null && (form.isCreator || form.isSeries)) {
            GhostButton(CalText.DELETE, { if (form.isSeries) ask = Ask.Delete else run { onDelete(Scope.All) } }, Modifier.fillMaxWidth(), danger = true)
        }
    }
}

@Composable
private fun RepeatField(d: EventDraft, rrule: String?, onPick: (Repeat) -> Unit) {
    val p = LocalPalette.current
    var menu by remember { mutableStateOf(false) }
    val label = if (d.repeat == Repeat.Custom && rrule != null) Rules.describe(rrule) else d.repeat.label
    Column {
        Box {
            OutlinedTextField(label, {}, Modifier.fillMaxWidth(), readOnly = true, label = { Text(CalText.REPEAT) }, colors = fieldColors(), trailingIcon = { Text("▾", color = p.inkSoft) })
            Box(Modifier.matchParentSize().clickable(role = Role.DropdownList, onClickLabel = CalText.REPEAT) { menu = true })
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = p.surface) {
                for (r in listOf(Repeat.None, Repeat.Weekly, Repeat.Biweekly, Repeat.Monthly, Repeat.Yearly) + if (rrule != null && Rules.kind(rrule) == Repeat.Custom) listOf(Repeat.Custom) else emptyList()) {
                    DropdownMenuItem(text = { Text(if (r == Repeat.Custom) Rules.describe(rrule!!) else r.label, color = p.ink) }, onClick = { onPick(r); menu = false })
                }
            }
        }
        if (d.repeat != Repeat.None && d.repeat != Repeat.Custom) {
            Text(Rules.describe(Rules.simple(d.repeat, d.startDate)), style = MaterialTheme.typography.bodySmall, color = p.inkSoft, modifier = Modifier.padding(top = 4.dp, start = 4.dp))
        }
    }
}
