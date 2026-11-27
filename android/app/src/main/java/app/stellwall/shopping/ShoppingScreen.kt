package app.stellwall.shopping

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.CATEGORIES
import app.stellwall.api.Item
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.Suggestion
import app.stellwall.api.Visibility
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BoxCard
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.LinkButton
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.RowDivider
import app.stellwall.ui.SectionHead
import app.stellwall.ui.Sheet
import app.stellwall.ui.fieldColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch

private sealed interface Open {
    data object Manage : Open
    data object NewList : Open
    data object Rename : Open
    data object Delete : Open
    data object Visibility : Open
    data class NewListVisibility(val name: String) : Open
    data class EditItem(val item: Item) : Open
}

@Composable
fun ShoppingScreen(model: ShoppingModel, listId: String? = null, live: Flow<LiveEvent> = emptyFlow(), leaveScope: CoroutineScope? = null) {
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf<Open?>(null) }
    LaunchedEffect(model, listId) { model.load(listId) }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    // Leaving marks the new things as seen; the outer scope outlives this screen.
    DisposableEffect(model) { onDispose { leaveScope?.launch { model.leave() } } }
    val p = LocalPalette.current
    val list = s.list
    val nameOf = { id: String? -> s.members.firstOrNull { it.id == id }?.displayName ?: "?" }

    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        PageHead(title = list?.name ?: ShopText.TITLE, sub = if (list != null) ShopText.TITLE else null)
        if (s.loaded && list == null) {
            s.error?.let { Notice(it) }
            PrimaryButton(ShopText.RETRY, { scope.launch { model.load() } }, Modifier.padding(top = 12.dp))
            return@Column
        }
        if (list == null) return@Column

        if (s.lists.size > 1) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (l in s.lists) {
                    val on = l.id == list.id
                    Row(
                        Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(if (on) p.surface else p.field)
                            .border(1.dp, if (on) p.primary else p.field, RoundedCornerShape(50))
                            .selectable(selected = on, role = Role.Tab) { scope.launch { model.select(l.id) } }
                            .padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(l.name, style = MaterialTheme.typography.labelLarge, color = p.ink)
                        if (l.openCount > 0) Text("${l.openCount}", style = MaterialTheme.typography.titleMedium.copy(fontSize = 13.sp), color = p.inkSoft)
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            val see = ShopText.see(visibilityLabel(list.visibility, s.members, model.me.id))
            Row(
                Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(p.surface).border(1.dp, p.rule, RoundedCornerShape(50))
                    .clickable(role = Role.Button) { open = Open.Visibility }.padding(start = 9.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.vector(Icons.MEMBERS), contentDescription = null, tint = p.ink, modifier = Modifier.size(20.dp))
                Text(see, style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp), color = p.ink)
            }
            LinkButton(ShopText.MANAGE) { open = Open.Manage }
        }

        AddItem(model)
        s.error?.let { Notice(it, Modifier.padding(top = 10.dp)) }

        val groups = s.groups
        if (groups.isEmpty()) {
            BoxCard(Modifier.padding(top = 8.dp)) { Text(ShopText.EMPTY, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(14.dp)) }
        }
        for (g in groups) {
            Text(g.category, style = MaterialTheme.typography.titleMedium.copy(fontSize = 15.sp), color = p.inkSoft, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
            BoxCard {
                g.items.forEachIndexed { i, item ->
                    if (i > 0) RowDivider()
                    ItemRow(
                        item, isNew = item.id in s.unseen,
                        meta = if (item.addedBy != model.me.id) ShopText.from(nameOf(item.addedBy)) else null,
                        onToggle = { scope.launch { model.toggle(item) } }, onEdit = { open = Open.EditItem(item) },
                    )
                }
            }
        }
        if (s.checked.isNotEmpty()) {
            SectionHead(ShopText.CHECKED)
            Text(ShopText.VANISH, style = MaterialTheme.typography.bodySmall, color = p.inkSoft, modifier = Modifier.padding(bottom = 8.dp).offset(y = (-4).dp))
            BoxCard {
                s.checked.forEachIndexed { i, item ->
                    if (i > 0) RowDivider()
                    ItemRow(item, isNew = false, meta = ShopText.checkedBy(nameOf(item.checkedBy)), onToggle = { scope.launch { model.toggle(item) } }, onEdit = { open = Open.EditItem(item) })
                }
            }
        }
    }

    val close = { open = null }
    when (val o = open) {
        null -> Unit
        Open.Manage -> Sheet(ShopText.MANAGE, close) {
            GhostButton(ShopText.NEW_LIST, { open = Open.NewList }, Modifier.fillMaxWidth())
            GhostButton(ShopText.RENAME_LIST, { open = Open.Rename }, Modifier.fillMaxWidth())
            if (list?.createdBy == model.me.id) GhostButton(ShopText.DELETE_LIST, { open = Open.Delete }, Modifier.fillMaxWidth(), danger = true)
            GhostButton(ShopText.CANCEL, close, Modifier.fillMaxWidth())
        }
        Open.NewList -> NameSheet(ShopText.NEW_LIST, "", close) { open = Open.NewListVisibility(it) }
        Open.Rename -> NameSheet(ShopText.RENAME_LIST, list?.name.orEmpty(), close) { name -> scope.launch { model.renameList(name); open = null } }
        Open.Delete -> Sheet(ShopText.deleteListConfirm(list?.name.orEmpty()), close) {
            GhostButton(ShopText.DELETE_LIST, { scope.launch { model.deleteList(); open = null } }, Modifier.fillMaxWidth(), danger = true)
            GhostButton(ShopText.CANCEL, close, Modifier.fillMaxWidth())
        }
        Open.Visibility -> if (list != null) {
            val creator = list.createdBy == model.me.id
            VisibilitySheet(
                lead = if (creator) ShopText.TITLE + ": " + list.name else ShopText.ONLY_CREATOR, value = list.visibility, members = s.members, meId = model.me.id,
                readOnly = !creator, onClose = close,
            ) { v -> scope.launch { model.setVisibility(v); open = null } }
        }
        is Open.NewListVisibility -> VisibilitySheet(
            lead = ShopText.NEW_LIST + ": " + o.name, value = Visibility(true, emptyList()), members = s.members, meId = model.me.id, readOnly = false, onClose = close,
        ) { v -> scope.launch { model.createList(o.name, v); open = null } }
        is Open.EditItem -> EditItemSheet(o.item, close, onDelete = { scope.launch { model.delete(o.item); open = null } }) { name, qty, cat ->
            scope.launch { if (model.edit(o.item, name, qty, cat)) open = null }
        }
    }
}

@Composable
private fun ItemRow(item: Item, isNew: Boolean, meta: String?, onToggle: () -> Unit, onEdit: () -> Unit) {
    val p = LocalPalette.current
    val done = item.checkedAt != null
    Row(Modifier.fillMaxWidth().background(if (isNew) p.changeSoft else p.surface).padding(end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).heightIn(min = 52.dp).clickable(role = Role.Button, onClickLabel = ShopText.EDIT_ITEM, onClick = onEdit).padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.Center) {
            Text(
                item.name, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp, textDecoration = if (done) TextDecoration.LineThrough else null),
                color = if (done) p.inkSoft else p.ink,
            )
            if (meta != null) Text(meta, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
        }
        // Always there, also empty: the tick boxes stay in one column.
        Text(item.quantity, style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp), color = p.ink, modifier = Modifier.padding(horizontal = 4.dp))
        Box(
            Modifier.size(48.dp).toggleable(value = done, role = Role.Checkbox, onValueChange = { onToggle() })
                .semantics { contentDescription = if (done) ShopText.uncheck(item.name) else ShopText.check(item.name) },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(26.dp).clip(RoundedCornerShape(7.dp)).background(if (done) p.ink else p.surface)
                    .border(2.dp, if (done) p.ink else p.inkSoft, RoundedCornerShape(7.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (done) Canvas(Modifier.size(18.dp)) {
                    val w = size.width / 24f
                    val stroke = Stroke(width = 2.4f * w, cap = StrokeCap.Round)
                    drawLine(p.surface, Offset(6 * w, 12.5f * w), Offset(10 * w, 16.5f * w), strokeWidth = stroke.width, cap = StrokeCap.Round)
                    drawLine(p.surface, Offset(10 * w, 16.5f * w), Offset(18 * w, 7.5f * w), strokeWidth = stroke.width, cap = StrokeCap.Round)
                }
            }
        }
    }
}

@Composable
private fun AddItem(model: ShoppingModel) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var quantity by rememberSaveable { mutableStateOf("") }
    var sugg by remember { mutableStateOf<List<Suggestion>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(name) {
        if (name.isBlank()) {
            sugg = emptyList()
            return@LaunchedEffect
        }
        delay(120)
        sugg = model.suggestions(name)
    }
    val add = { picked: Suggestion? ->
        if (!busy && (picked != null || name.isNotBlank())) {
            busy = true
            scope.launch {
                if (model.add(name, quantity, picked)) {
                    name = ""
                    quantity = ""
                    sugg = emptyList()
                }
                busy = false
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(ShopText.ADD, style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp), color = p.inkSoft)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                name, { name = it.take(80) }, singleLine = true, colors = fieldColors(),
                placeholder = { Text(ShopText.ADD_PLACEHOLDER, maxLines = 1) },
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { add(null) }),
                modifier = Modifier.weight(1f).semantics { contentDescription = ShopText.ADD },
            )
            OutlinedTextField(
                quantity, { quantity = it.take(30) }, Modifier.width(92.dp), singleLine = true, colors = fieldColors(),
                placeholder = { Text(ShopText.QUANTITY, maxLines = 1) },
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { add(null) }),
            )
        }
        if (sugg.isNotEmpty()) {
            Surface(shape = RadiusSm, color = p.surface, border = BorderStroke(1.dp, p.rule), shadowElevation = 4.dp) {
                Column {
                    sugg.forEachIndexed { i, sg ->
                        if (i > 0) RowDivider()
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { add(sg) }.padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(sg.name, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.weight(1f))
                            Text(sg.category, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                        }
                    }
                }
            }
        }
        // Below the suggestions, so they sit right under the field and above the keyboard.
        PrimaryButton(ShopText.ADD_BUTTON, { add(null) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank() && !busy)
    }
}

@Composable
private fun NameSheet(title: String, initial: String, onClose: () -> Unit, onSave: (String) -> Unit) {
    var name by rememberSaveable { mutableStateOf(initial) }
    val focus = LocalFocusManager.current
    // The name is the only thing to do here: the keyboard opens right away.
    val field = remember { FocusRequester() }
    LaunchedEffect(Unit) { field.requestFocus() }
    Sheet(title, onClose) {
        OutlinedTextField(
            name, { name = it.take(40) }, Modifier.fillMaxWidth().focusRequester(field), label = { Text(ShopText.LIST_NAME) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (name.isNotBlank()) { focus.clearFocus(); onSave(name.trim()) } }),
        )
        PrimaryButton(ShopText.SAVE, { focus.clearFocus(); onSave(name.trim()) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank())
        GhostButton(ShopText.CANCEL, onClose, Modifier.fillMaxWidth())
    }
}

@Composable
private fun EditItemSheet(item: Item, onClose: () -> Unit, onDelete: () -> Unit, onSave: (String, String, String) -> Unit) {
    val p = LocalPalette.current
    var name by rememberSaveable { mutableStateOf(item.name) }
    var quantity by rememberSaveable { mutableStateOf(item.quantity) }
    var category by rememberSaveable { mutableStateOf(item.category) }
    var menu by remember { mutableStateOf(false) }
    Sheet(ShopText.EDIT_ITEM, onClose) {
        OutlinedTextField(name, { name = it.take(80) }, Modifier.fillMaxWidth(), label = { Text(ShopText.NAME) }, singleLine = true, colors = fieldColors())
        OutlinedTextField(quantity, { quantity = it.take(30) }, Modifier.fillMaxWidth(), label = { Text(ShopText.QUANTITY) }, singleLine = true, colors = fieldColors())
        // The store section: a read-only field that opens the list of sections.
        Box {
            OutlinedTextField(
                category, {}, Modifier.fillMaxWidth(), readOnly = true, label = { Text(ShopText.CATEGORY) }, colors = fieldColors(),
                trailingIcon = { Text("▾", color = p.inkSoft) },
            )
            Box(Modifier.matchParentSize().clickable(role = Role.DropdownList, onClickLabel = ShopText.CATEGORY) { menu = true })
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = p.surface) {
                for (c in CATEGORIES) DropdownMenuItem(text = { Text(c, color = p.ink) }, onClick = { category = c; menu = false })
            }
        }
        PrimaryButton(ShopText.SAVE, { onSave(name, quantity, category) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank())
        GhostButton(ShopText.CANCEL, onClose, Modifier.fillMaxWidth())
        GhostButton(ShopText.DELETE_ITEM, onDelete, Modifier.fillMaxWidth(), danger = true)
    }
}

private enum class Who { All, Me, Some }

@Composable
fun VisibilitySheet(lead: String, value: Visibility, members: List<Member>, meId: String, readOnly: Boolean, onClose: () -> Unit, onSave: (Visibility) -> Unit) {
    val p = LocalPalette.current
    var who by rememberSaveable { mutableStateOf(if (value.everyone) Who.All else if (value.memberIds.all { it == meId }) Who.Me else Who.Some) }
    var picked by rememberSaveable { mutableStateOf(value.memberIds.filter { it != meId }) }
    var error by remember { mutableStateOf<String?>(null) }
    Sheet(ShopText.VIS_TITLE, onClose) {
        Text(lead, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft)
        for ((w, title, sub) in listOf(Triple(Who.All, ShopText.ALL, ShopText.ALL_SUB), Triple(Who.Me, ShopText.ONLY_ME, ShopText.ONLY_ME_SUB), Triple(Who.Some, ShopText.SOME, ShopText.SOME_SUB))) {
            val on = who == w
            Row(
                Modifier.fillMaxWidth().clip(RadiusSm).border(1.5.dp, if (on) p.primary else p.rule, RadiusSm)
                    .selectable(selected = on, enabled = !readOnly, role = Role.RadioButton) { who = w; error = null }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                RadioButton(selected = on, onClick = null, enabled = !readOnly, colors = RadioButtonDefaults.colors(selectedColor = p.primary))
                Column {
                    Text(title, style = MaterialTheme.typography.labelLarge, color = p.ink)
                    Text(sub, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                }
            }
        }
        if (who == Who.Some) {
            for (m in members) {
                val mine = m.id == meId
                val on = mine || m.id in picked
                Row(
                    Modifier.fillMaxWidth().clip(RadiusSm).background(p.field)
                        .toggleable(value = on, enabled = !readOnly && !mine, role = Role.Checkbox) { picked = if (it) picked + m.id else picked - m.id; error = null }
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                        .semantics { stateDescription = if (on) "ausgewählt" else "nicht ausgewählt" },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null, enabled = !readOnly && !mine, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                    Text(m.displayName + if (mine) " " + ShopText.YOU else "", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = p.ink, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
        error?.let { Notice(it) }
        if (readOnly) {
            GhostButton(ShopText.CANCEL, onClose, Modifier.fillMaxWidth())
        } else {
            PrimaryButton(ShopText.SAVE, {
                when (who) {
                    Who.All -> onSave(Visibility(true, emptyList()))
                    Who.Me -> onSave(Visibility(false, listOf(meId)))
                    Who.Some -> if (picked.isEmpty()) error = ShopText.PICK_SOMEONE else onSave(Visibility(false, listOf(meId) + picked))
                }
            }, Modifier.fillMaxWidth())
            GhostButton(ShopText.CANCEL, onClose, Modifier.fillMaxWidth())
        }
    }
}
