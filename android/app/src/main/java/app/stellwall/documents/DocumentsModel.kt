package app.stellwall.documents

import app.stellwall.api.ApiException
import app.stellwall.api.DocumentDto
import app.stellwall.api.DocumentFile
import app.stellwall.api.DocumentMeta
import app.stellwall.api.DocumentsApi
import app.stellwall.api.Member
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

object DocText {
    const val PAGE = "Dokumente"
    const val SCAN = "Scannen"
    const val PICK = "Datei wählen"
    const val SEARCH = "Dokumente durchsuchen"
    const val ALL = "Alle"
    const val EMPTY = "Noch keine Dokumente. Scanne das erste oder wähle eine Datei."
    const val NONE = "Nichts gefunden. Die Suche findet Wörter im Namen, in der Kategorie und im Text des Dokuments."
    const val NEW = "Neues Dokument"
    const val EDIT = "Bearbeiten"
    const val NAME = "Name"
    const val CATEGORY = "Kategorie"
    const val NO_CATEGORY = "Keine"
    const val OWN_CATEGORY = "Eigene Kategorie …"
    const val OWN_LABEL = "Eigene Kategorie"
    const val VALID = "Gültig bis"
    const val VALID_EMPTY = "Gültig bis: läuft nicht ab"
    const val REMIND = "Erinnern"
    val REMIND_DAYS = listOf(7 to "1 Woche vorher", 30 to "1 Monat vorher", 90 to "3 Monate vorher")
    const val SAVE = "Speichern"
    const val SAVING = "Wird hochgeladen …"
    const val LOADING = "Wird geladen …"
    const val CANCEL = "Abbrechen"
    const val OPEN = "Öffnen"
    const val SHARE = "Teilen oder speichern"
    const val DELETE = "Löschen"
    fun deleteConfirm(name: String) = "„$name“ löschen? Die Datei ist dann weg."
    const val OCR_PENDING = "Text wird erkannt …"
    const val OCR_FAILED = "Text nicht erkannt. Das Dokument ist über Name und Kategorie zu finden."
    const val NOT_CONFIGURED = "Die Verwaltung muss Dokumente erst einrichten."
    const val TOO_LARGE = "Die Datei ist größer als 30 MB."
    const val BAD_TYPE = "Diese Datei geht nicht. Erlaubt sind PDF, JPG und PNG."
    const val NO_VIEWER = "Auf diesem Handy ist kein Programm zum Öffnen der Datei."
    const val INVALID = "Bitte die Eingaben prüfen."
    const val GENERIC = "Das hat nicht geklappt. Bitte gleich noch einmal versuchen."
    const val OFFLINE = "Keine Verbindung zum Server."

    private val date = DateTimeFormatter.ofPattern("dd.MM.yyyy")
    fun show(iso: String): String = LocalDate.parse(iso).format(date)
    fun pages(n: Int) = if (n == 1) "1 Seite" else "$n Seiten"
    fun until(iso: String, today: LocalDate): String = if (LocalDate.parse(iso).isBefore(today)) "abgelaufen am ${show(iso)}" else "gültig bis ${show(iso)}"
    /** From a month before it runs out the date is marked. */
    fun soon(iso: String, today: LocalDate) = ChronoUnit.DAYS.between(today, LocalDate.parse(iso)) <= 30

    fun error(e: Throwable): String = when ((e as? ApiException)?.code) {
        "documents_not_configured" -> NOT_CONFIGURED
        "too_large" -> TOO_LARGE
        "unsupported_type" -> BAD_TYPE
        "invalid_input" -> INVALID
        null -> if (e is java.io.IOException) OFFLINE else GENERIC
        else -> GENERIC
    }
}

const val MAX_BYTES = 30L * 1024 * 1024

data class DocumentsState(
    val items: List<DocumentDto> = emptyList(),
    val query: String = "",
    val category: String? = null,
    val categories: List<String> = emptyList(),
    val members: List<Member> = emptyList(),
    val loaded: Boolean = false,
    val notConfigured: Boolean = false,
    val error: String? = null,
)

class DocumentsModel(private val api: DocumentsApi, val me: Member) {
    private val _state = MutableStateFlow(DocumentsState())
    val state: StateFlow<DocumentsState> = _state

    suspend fun load() {
        try {
            val s = _state.value
            val items = api.documents(s.query, s.category)
            val categories = api.documentCategories()
            val members = if (s.members.isEmpty()) api.members() else s.members
            _state.update { it.copy(items = items, categories = categories, members = members, loaded = true, notConfigured = false, error = null) }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            val off = (e as? ApiException)?.code == "documents_not_configured"
            _state.update { it.copy(loaded = true, notConfigured = off, error = if (off) null else DocText.error(e)) }
        }
    }

    suspend fun search(q: String) {
        _state.update { it.copy(query = q) }
        load()
    }

    suspend fun pickCategory(c: String?) {
        _state.update { it.copy(category = c) }
        load()
    }

    /** Error to show, or null when stored. */
    suspend fun upload(meta: DocumentMeta, file: DocumentFile): String? {
        if (meta.name.isBlank()) return DocText.INVALID
        if (file.bytes.size > MAX_BYTES) return DocText.TOO_LARGE
        return attempt { api.uploadDocument(meta.copy(name = meta.name.trim(), category = meta.category?.trim()?.ifBlank { null }), file) }
    }

    suspend fun update(doc: DocumentDto, meta: DocumentMeta): String? {
        if (meta.name.isBlank()) return DocText.INVALID
        val visibility = if (doc.createdBy == me.id) meta.visibility else null
        return attempt { api.updateDocument(doc.id, meta.copy(name = meta.name.trim(), category = meta.category?.trim()?.ifBlank { null }, visibility = visibility)) }
    }

    suspend fun delete(doc: DocumentDto): String? = attempt { api.deleteDocument(doc.id) }

    suspend fun get(id: String): DocumentDto? = try {
        api.document(id)
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        null
    }

    /** Fetches the file into [dir] for the phone's viewer; null and an error text when it fails. */
    suspend fun fetch(doc: DocumentDto, dir: File): Pair<File?, String?> = try {
        val ext = when (doc.mime) { "application/pdf" -> "pdf"; "image/jpeg" -> "jpg"; "image/png" -> "png"; else -> "bin" }
        val safe = doc.name.replace(Regex("[^\\p{L}\\p{N} ._-]"), "_").take(80).ifBlank { "Dokument" }
        api.documentFile(doc.id, File(dir, "$safe.$ext")) to null
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        null to DocText.error(e)
    }

    private suspend fun attempt(block: suspend () -> Unit): String? = try {
        block()
        load()
        null
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        DocText.error(e)
    }
}
