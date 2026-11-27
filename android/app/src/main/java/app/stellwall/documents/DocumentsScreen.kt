package app.stellwall.documents

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.DocumentDto
import app.stellwall.api.DocumentFile
import app.stellwall.api.DocumentMeta
import app.stellwall.api.LiveEvent
import app.stellwall.api.Visibility
import app.stellwall.shopping.VisibilitySheet
import app.stellwall.shopping.visibilityLabel
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BackLink
import app.stellwall.ui.BoxCard
import app.stellwall.ui.DateField
import app.stellwall.ui.Dropdown
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RowDivider
import app.stellwall.ui.Sheet
import app.stellwall.ui.fieldColors
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import app.stellwall.ui.RefreshPage

/** The documents area: the list, one document, the form after a scan or a picked file. */
@Composable
fun DocumentsArea(model: DocumentsModel, live: Flow<LiveEvent> = emptyFlow(), startId: String? = null, today: LocalDate = LocalDate.now(), onBack: () -> Unit) {
    var openId by rememberSaveable { mutableStateOf(startId) }
    LaunchedEffect(model) { model.load() }
    LaunchedEffect(live) { live.collect { if (it == LiveEvent.Documents || it == LiveEvent.Connected) model.load() } }
    val context = LocalContext.current
    // Files fetched for the viewer stay only while the area is open.
    DisposableEffect(Unit) { onDispose { File(context.cacheDir, "updates/documents").deleteRecursively() } }
    BackHandler(enabled = openId != null) { openId = null }
    val s by model.state.collectAsStateWithLifecycle()
    val doc = openId?.let { id -> s.items.firstOrNull { it.id == id } }
    var single by remember(openId) { mutableStateOf<DocumentDto?>(null) }
    LaunchedEffect(openId) { if (openId != null && doc == null) single = model.get(openId!!) }
    val shown = doc ?: single
    if (openId != null && shown != null) DocumentScreen(model, shown, today, onBack = { openId = null })
    else DocumentsScreen(model, today, onOpen = { openId = it.id }, onBack = onBack)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DocumentsScreen(model: DocumentsModel, today: LocalDate = LocalDate.now(), onOpen: (DocumentDto) -> Unit, onBack: () -> Unit) {
    val p = LocalPalette.current
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var q by rememberSaveable { mutableStateOf(s.query) }
    var picked by remember { mutableStateOf<DocumentFile?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var canScan by rememberSaveable { mutableStateOf(true) }
    LaunchedEffect(q) {
        if (q == s.query) return@LaunchedEffect
        delay(250)
        model.search(q)
    }
    val sources = rememberDocumentSources(
        onFile = { r ->
            note = null
            when (r) {
                is Picked.File -> picked = r.file
                Picked.TooLarge -> note = DocText.TOO_LARGE
                null -> Unit
            }
        },
        onScanUnavailable = { canScan = false },
    )

    RefreshPage({ model.load() }) {
        Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BackLink("Start", onBack)
        PageHead(DocText.PAGE)
        if (s.notConfigured) {
            BoxCard { Text(DocText.NOT_CONFIGURED, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.padding(16.dp)) }
            return@Column
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (canScan && sources.scan != null) PrimaryButton(DocText.SCAN, sources.scan, Modifier.weight(1f))
            GhostButton(DocText.PICK, sources.pick, Modifier.weight(1f))
        }
        note?.let { Notice(it) }
        s.error?.let { Notice(it) }
        OutlinedTextField(
            q, { q = it.take(200) }, Modifier.fillMaxWidth(), label = { Text(DocText.SEARCH) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (c in listOf<String?>(null) + s.categories) {
                val on = c == s.category
                Box(
                    Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(50)).background(if (on) p.surface else p.field)
                        .border(if (on) 2.dp else 1.dp, if (on) p.primary else p.rule, RoundedCornerShape(50))
                        .selectable(selected = on, role = Role.RadioButton) { scope.launch { model.pickCategory(c) } }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(c ?: DocText.ALL, style = MaterialTheme.typography.labelLarge, color = p.ink) }
            }
        }
        if (s.loaded && s.items.isEmpty()) {
            BoxCard { Text(if (s.query.isNotBlank() || s.category != null) DocText.NONE else DocText.EMPTY, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft, modifier = Modifier.padding(16.dp)) }
        }
        if (s.items.isNotEmpty()) {
            BoxCard {
                s.items.forEachIndexed { i, d ->
                    if (i > 0) RowDivider()
                    DocumentRow(d, today) { onOpen(d) }
                }
            }
        }
    }
    }
    picked?.let { f ->
        DocumentSheet(model, doc = null, file = f, onClose = { picked = null })
    }
}

@Composable
private fun DocumentRow(d: DocumentDto, today: LocalDate, onClick: () -> Unit) {
    val p = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.vector(Icons.DOCUMENTS), contentDescription = null, tint = p.inkSoft, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f)) {
            Text(d.name, style = MaterialTheme.typography.labelLarge, color = p.ink)
            val meta = listOfNotNull(d.category, d.pages?.let { DocText.pages(it) }).joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
            d.validUntil?.let { Text(DocText.until(it, today), style = MaterialTheme.typography.bodySmall, color = if (DocText.soon(it, today)) p.changeInk else p.inkSoft) }
            d.snippet?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = p.inkSoft) }
        }
    }
}

@Composable
fun DocumentScreen(model: DocumentsModel, doc: DocumentDto, today: LocalDate = LocalDate.now(), onBack: () -> Unit) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var edit by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun hand(share: Boolean) = scope.launch {
        busy = true
        val (file, e) = model.fetch(doc, File(context.cacheDir, "updates/documents"))
        busy = false
        if (file == null) { error = e; return@launch }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        val intent = (if (share) Intent(Intent.ACTION_SEND).setType(doc.mime).putExtra(Intent.EXTRA_STREAM, uri) else Intent(Intent.ACTION_VIEW).setDataAndType(uri, doc.mime))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .apply { clipData = android.content.ClipData.newRawUri(doc.name, uri) }
        try {
            context.startActivity(if (share) Intent.createChooser(intent, null) else intent)
        } catch (_: ActivityNotFoundException) {
            error = DocText.NO_VIEWER
        }
    }

    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BackLink(DocText.PAGE, onBack)
        PageHead(doc.name, sub = doc.category)
        val meta = listOfNotNull(doc.pages?.let { DocText.pages(it) }, doc.validUntil?.let { DocText.until(it, today) }).joinToString(" · ")
        if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodyLarge, color = if (doc.validUntil != null && DocText.soon(doc.validUntil, today)) p.changeInk else p.inkSoft)
        when (doc.ocr) {
            "pending" -> Text(DocText.OCR_PENDING, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft)
            "failed" -> Text(DocText.OCR_FAILED, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft)
        }
        error?.let { Notice(it) }
        PrimaryButton(if (busy) DocText.LOADING else DocText.OPEN, { hand(share = false) }, Modifier.fillMaxWidth(), enabled = !busy)
        GhostButton(DocText.SHARE, { hand(share = true) }, Modifier.fillMaxWidth())
        GhostButton(DocText.EDIT, { edit = true }, Modifier.fillMaxWidth())
        if (doc.createdBy == model.me.id) GhostButton(DocText.DELETE, { confirm = true }, Modifier.fillMaxWidth(), danger = true)
    }
    if (edit) DocumentSheet(model, doc = doc, file = null, onClose = { edit = false })
    if (confirm) {
        Sheet(DocText.deleteConfirm(doc.name), { confirm = false }) {
            GhostButton(DocText.DELETE, { scope.launch { error = model.delete(doc); confirm = false; if (error == null) onBack() } }, Modifier.fillMaxWidth(), danger = true)
            GhostButton(DocText.CANCEL, { confirm = false }, Modifier.fillMaxWidth())
        }
    }
}

/** The details of a new file (doc null) or of a stored document. */
@Composable
fun DocumentSheet(model: DocumentsModel, doc: DocumentDto?, file: DocumentFile?, onClose: () -> Unit) {
    val p = LocalPalette.current
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val creator = doc == null || doc.createdBy == model.me.id
    var name by rememberSaveable { mutableStateOf(doc?.name ?: file?.let { nameFromFile(it.name) }.orEmpty()) }
    var category by rememberSaveable { mutableStateOf(doc?.category.orEmpty()) }
    var own by rememberSaveable { mutableStateOf(doc?.category != null && doc.category !in s.categories) }
    var valid by remember { mutableStateOf(doc?.validUntil?.let { LocalDate.parse(it) }) }
    var remind by rememberSaveable { mutableStateOf(doc?.remindDays ?: 30) }
    var visibility by remember { mutableStateOf(doc?.visibility ?: Visibility(true, emptyList())) }
    var who by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Sheet(if (doc == null) DocText.NEW else DocText.EDIT, onClose) {
        OutlinedTextField(
            name, { name = it.take(120) }, Modifier.fillMaxWidth(), label = { Text(DocText.NAME) }, singleLine = true, colors = fieldColors(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        val options = listOf(DocText.NO_CATEGORY) + s.categories + DocText.OWN_CATEGORY
        Dropdown(DocText.CATEGORY, if (own) DocText.OWN_CATEGORY else category.ifEmpty { DocText.NO_CATEGORY }, options, Modifier.fillMaxWidth()) { i ->
            when (i) {
                0 -> { own = false; category = "" }
                options.lastIndex -> { own = true; category = "" }
                else -> { own = false; category = s.categories[i - 1] }
            }
        }
        if (own) OutlinedTextField(category, { category = it.take(40) }, Modifier.fillMaxWidth(), label = { Text(DocText.OWN_LABEL) }, singleLine = true, colors = fieldColors())
        DateField(DocText.VALID, valid, Modifier.fillMaxWidth(), empty = DocText.VALID_EMPTY, onClear = { valid = null }) { valid = it }
        if (valid != null) {
            Dropdown(DocText.REMIND, DocText.REMIND_DAYS.first { it.first == remind }.second, DocText.REMIND_DAYS.map { it.second }, Modifier.fillMaxWidth()) { remind = DocText.REMIND_DAYS[it].first }
        }
        if (creator) GhostButton("Wer darf das sehen? " + visibilityLabel(visibility, s.members, model.me.id), { who = true }, Modifier.fillMaxWidth())
        error?.let { Notice(it) }
        PrimaryButton(if (busy) DocText.SAVING else DocText.SAVE, {
            scope.launch {
                busy = true
                val meta = DocumentMeta(name, category.ifBlank { null }, valid?.toString(), remind, visibility)
                error = if (doc == null) model.upload(meta, file!!) else model.update(doc, meta)
                busy = false
                if (error == null) onClose()
            }
        }, Modifier.fillMaxWidth(), enabled = !busy && name.isNotBlank())
        GhostButton(DocText.CANCEL, onClose, Modifier.fillMaxWidth())
    }
    if (who) VisibilitySheet(name, visibility, s.members, model.me.id, readOnly = false, onClose = { who = false }) { visibility = it; who = false }
}
