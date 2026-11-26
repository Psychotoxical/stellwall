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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.Birthday
import app.stellwall.api.BirthdayChange
import app.stellwall.api.Visibility
import app.stellwall.shopping.ShopText
import app.stellwall.shopping.VisibilitySheet
import app.stellwall.shopping.visibilityLabel
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BackLink
import app.stellwall.ui.BoxCard
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PersonChip
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.RowDivider
import app.stellwall.ui.Sheet
import app.stellwall.ui.fieldColors
import kotlinx.coroutines.launch

@Composable
fun BirthdaysScreen(model: BirthdaysModel, onBack: () -> Unit) {
    val list by model.list.collectAsStateWithLifecycle()
    var form by remember { mutableStateOf<Pair<Boolean, Birthday?>?>(null) }
    LaunchedEffect(model) { model.load() }
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        BackLink(CalText.PAGE, onBack)
        PageHead(title = CalText.B_TITLE, sub = CalText.B_PAGE)
        PrimaryButton(CalText.B_NEW, { form = true to null }, Modifier.fillMaxWidth().padding(bottom = 12.dp))
        val rows = list
        if (rows != null && rows.isEmpty()) BoxCard { Text(CalText.B_EMPTY, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(14.dp)) }
        if (!rows.isNullOrEmpty()) BoxCard {
            rows.forEachIndexed { n, b ->
                if (n > 0) RowDivider()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) { form = true to b }.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(Icons.vector(Icons.CAKE), contentDescription = null, tint = p.ink, modifier = Modifier.size(24.dp))
                    Column(Modifier.weight(1f)) {
                        Text(b.name, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink)
                        Text(CalText.whenText(b.day, b.month) + (model.turns(b)?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                    }
                }
            }
        }
    }
    form?.let { (_, b) -> BirthdaySheet(model, b) { form = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BirthdaySheet(model: BirthdaysModel, b: Birthday?, onClose: () -> Unit) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    val meId = model.me.id
    val isCreator = b == null || b.createdBy == meId
    var name by remember { mutableStateOf(b?.name ?: "") }
    var day by remember { mutableStateOf(b?.day ?: 1) }
    var month by remember { mutableStateOf(b?.month ?: java.time.LocalDate.now().monthValue) }
    var year by remember { mutableStateOf(b?.year?.toString() ?: "") }
    var visibility by remember { mutableStateOf(b?.visibility ?: Visibility(true, emptyList())) }
    var remindDays by remember { mutableStateOf(b?.remindDays ?: 1) }
    var remindWho by remember { mutableStateOf(b?.remindWho ?: listOf(meId)) }
    var error by remember { mutableStateOf<String?>(null) }
    var who by remember { mutableStateOf(false) }

    if (who) {
        VisibilitySheet(lead = name, value = visibility, members = model.members, meId = meId, readOnly = false, onClose = { who = false }) { visibility = it; who = false }
        return
    }
    Sheet(if (b != null) CalText.B_EDIT else CalText.B_NEW, onClose) {
        OutlinedTextField(name, { name = it.take(80) }, Modifier.fillMaxWidth(), label = { Text(CalText.B_NAME) }, singleLine = true, colors = fieldColors())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pick(CalText.B_DAY, "$day", (1..31).map { "$it" }, Modifier.weight(1f)) { day = it + 1 }
            Pick(CalText.B_MONTH, CalText.MONTHS[month - 1], CalText.MONTHS, Modifier.weight(2f)) { month = it + 1 }
        }
        OutlinedTextField(
            year, { year = it.filter(Char::isDigit).take(4) }, Modifier.fillMaxWidth(), label = { Text(CalText.B_YEAR) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), supportingText = { Text(CalText.B_YEAR_HINT, color = p.inkSoft) },
        )
        if (isCreator) {
            Row(
                Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(p.surface).border(1.dp, p.rule, RoundedCornerShape(50))
                    .clickable(role = Role.Button) { who = true }.padding(start = 9.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.vector(Icons.MEMBERS), contentDescription = null, tint = p.ink, modifier = Modifier.size(20.dp))
                Text(ShopText.see(visibilityLabel(visibility, model.members, meId)), style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp), color = p.ink)
            }
        }
        Pick(CalText.B_REMIND, CalText.REMIND_DAYS.firstOrNull { it.first == remindDays }?.second ?: "$remindDays", CalText.REMIND_DAYS.map { it.second }, Modifier.fillMaxWidth()) {
            remindDays = CalText.REMIND_DAYS[it].first
        }
        Text(CalText.B_REMIND_WHO, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (m in model.members) {
                val on = m.id in remindWho
                Row(
                    Modifier.clip(RadiusSm).background(p.field).toggleable(value = on, role = Role.Checkbox) { remindWho = if (it) remindWho + m.id else remindWho - m.id }.padding(end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                    PersonChip(m.displayName, m.color)
                    Text(m.displayName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = p.ink, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
        Text(CalText.REMINDER_LATER, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
        error?.let { Notice(it) }
        PrimaryButton(CalText.SAVE, {
            scope.launch {
                error = model.save(b, BirthdayChange(name, day, month, year.toIntOrNull(), remindDays, remindWho, visibility))
                if (error == null) onClose()
            }
        }, Modifier.fillMaxWidth())
        GhostButton(CalText.CANCEL, onClose, Modifier.fillMaxWidth())
        if (b != null && isCreator) GhostButton(CalText.B_DELETE, { scope.launch { model.delete(b); onClose() } }, Modifier.fillMaxWidth(), danger = true)
    }
}

@Composable
private fun Pick(label: String, value: String, options: List<String>, modifier: Modifier, onPick: (Int) -> Unit) {
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
