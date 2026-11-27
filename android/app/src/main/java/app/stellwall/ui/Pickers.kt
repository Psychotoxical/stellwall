package app.stellwall.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.stellwall.calendar.Days
import app.stellwall.theme.LocalPalette
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

private const val CANCEL = "Abbrechen"
private const val NONE = "Keins"

/** A date that opens the date picker; shown as "Do., 3.12.2026", or [empty] when none is set. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label: String, date: LocalDate?, modifier: Modifier = Modifier, empty: String = "", onClear: (() -> Unit)? = null, onPick: (LocalDate) -> Unit) {
    val p = LocalPalette.current
    var open by remember { mutableStateOf(false) }
    PickerBox(date?.let(Days::dateShort) ?: empty, label, modifier, soft = date == null) { open = true }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = (date ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    open = false
                }) { Text("OK", color = p.ink) }
            },
            dismissButton = {
                if (onClear != null && date != null) TextButton(onClick = { onClear(); open = false }) { Text(NONE, color = p.ink) }
                TextButton(onClick = { open = false }) { Text(CANCEL, color = p.ink) }
            },
            colors = DatePickerDefaults.colors(containerColor = p.surface),
        ) {
            DatePicker(
                state = state,
                colors = DatePickerDefaults.colors(
                    containerColor = p.surface, titleContentColor = p.inkSoft, headlineContentColor = p.ink, weekdayContentColor = p.inkSoft,
                    navigationContentColor = p.ink, yearContentColor = p.ink, currentYearContentColor = p.primary, selectedYearContainerColor = p.primary,
                    selectedYearContentColor = p.primaryInk, dayContentColor = p.ink, selectedDayContainerColor = p.primary, selectedDayContentColor = p.primaryInk,
                    todayContentColor = p.primary, todayDateBorderColor = p.primary, dividerColor = p.rule,
                ),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeField(label: String, time: LocalTime?, modifier: Modifier = Modifier, empty: String = "", onClear: (() -> Unit)? = null, onPick: (LocalTime) -> Unit) {
    val p = LocalPalette.current
    var open by remember { mutableStateOf(false) }
    PickerBox(time?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: empty, label, modifier, soft = time == null) { open = true }
    if (open) {
        val start = time ?: LocalTime.of(9, 0)
        val state = rememberTimePickerState(initialHour = start.hour, initialMinute = start.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = { TextButton(onClick = { onPick(LocalTime.of(state.hour, state.minute)); open = false }) { Text("OK", color = p.ink) } },
            dismissButton = {
                if (onClear != null && time != null) TextButton(onClick = { onClear(); open = false }) { Text(NONE, color = p.ink) }
                TextButton(onClick = { open = false }) { Text(CANCEL, color = p.ink) }
            },
            text = {
                TimePicker(
                    state = state,
                    colors = TimePickerDefaults.colors(
                        clockDialColor = p.field, clockDialSelectedContentColor = p.primaryInk, selectorColor = p.primary,
                        containerColor = p.surface, timeSelectorSelectedContainerColor = p.primary, timeSelectorSelectedContentColor = p.primaryInk,
                    ),
                )
            },
            containerColor = p.surface,
        )
    }
}

@Composable
private fun PickerBox(value: String, label: String, modifier: Modifier, soft: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        modifier.heightIn(min = 52.dp).clip(RadiusSm).border(1.dp, p.rule, RadiusSm).background(p.surface)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = "$label: $value" }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart,
    ) { Text(value, style = MaterialTheme.typography.bodyLarge, color = if (soft) p.inkSoft else p.ink) }
}

/** A read-only field that opens a list to pick from. */
@Composable
fun Dropdown(label: String, value: String, options: List<String>, modifier: Modifier = Modifier, onPick: (Int) -> Unit) {
    val p = LocalPalette.current
    var menu by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(value, {}, Modifier.fillMaxWidth(), readOnly = true, label = { Text(label) }, colors = fieldColors(), trailingIcon = { Text("▾", color = p.inkSoft) })
        Box(Modifier.matchParentSize().clickable(role = Role.DropdownList, onClickLabel = label) { menu = true })
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = p.surface) {
            options.forEachIndexed { i, o -> DropdownMenuItem(text = { Text(o, color = p.ink) }, onClick = { onPick(i); menu = false }) }
        }
    }
}

/** − n +, as the web app's servings stepper. */
@Composable
fun Stepper(label: String, value: Int, min: Int, max: Int, fewer: String, more: String, onChange: (Int) -> Unit) {
    val p = LocalPalette.current
    androidx.compose.foundation.layout.Column {
        Text(label, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
            StepButton("−", fewer, value > min) { onChange(value - 1) }
            Text("$value", style = MaterialTheme.typography.titleLarge, color = p.ink, modifier = Modifier.padding(horizontal = 14.dp).semantics { contentDescription = "$label: $value" })
            StepButton("+", more, value < max) { onChange(value + 1) }
        }
    }
}

@Composable
private fun StepButton(text: String, label: String, enabled: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(p.field)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label }
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = MaterialTheme.typography.titleLarge, color = if (enabled) p.ink else p.inkSoft) }
}
