package app.stellwall.todos

import app.stellwall.api.quietly
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.Occurrence
import app.stellwall.api.Recurrence
import app.stellwall.api.TodoBody
import app.stellwall.api.TodoRule
import app.stellwall.api.TodosApi
import app.stellwall.api.Visibility
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class TodoView(val query: String, val label: String, val empty: String) {
    Today("today", "Heute", "Heute steht nichts an."),
    Upcoming("upcoming", "Demnächst", "In den nächsten zwei Wochen steht nichts an."),
    Undated("undated", "Ohne Termin", "Keine To-dos ohne Termin."),
}

/** The web app's to-do wording (web/src/text/de.ts: todos). */
object TodoText {
    const val TITLE = "Was ist zu tun?"
    const val PAGE = "To-dos"
    const val NEW = "Neues To-do"
    const val EDIT = "To-do bearbeiten"
    const val MINE = "Meine"
    const val ALL = "Alle"
    const val OVERDUE = "Überfällig"
    fun check(t: String) = "$t abhaken"
    fun uncheck(t: String) = "$t wieder offen"
    fun doneBy(who: String) = "$who hat erledigt"
    const val WHAT = "Was ist zu tun?"
    const val ASSIGNEES = "Wer kümmert sich?"
    const val DATE = "Datum"
    const val TIME = "Uhrzeit"
    const val NO_DATE = "Ohne Datum"
    const val NO_TIME = "Ohne Uhrzeit"
    const val REPEAT = "Wiederholen"
    val REPEATS = listOf("none" to "Nie", "daily" to "Täglich", "weekly" to "An Wochentagen", "monthly" to "Monatlich")
    val WEEKDAYS = listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
    const val UNTIL = "Wiederholen bis (optional)"
    const val NEEDS_CONFIRM = "Muss bestätigt werden"
    const val NEEDS_CONFIRM_SUB = "Man hakt es ab, und alle sehen, wer es erledigt hat."
    const val REMINDERS = "Erinnern"
    val REMINDER_CHIPS = listOf(1440 to "1 Tag vorher", 60 to "1 Stunde vorher", 10 to "10 Minuten vorher")
    const val REMINDER_LATER = "Erinnerungen kommen aufs Handy, sobald Benachrichtigungen erlaubt sind."
    const val DELETE = "To-do löschen"
    const val PICK_DAY = "Wähle mindestens einen Wochentag."
    const val NEEDS_DATE = "Für eine Wiederholung braucht es ein Datum."
    const val INVALID = "Bitte die Eingaben prüfen."
    const val GENERIC = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    const val MY_TODAY = "Heute für dich"
    const val MY_TODAY_EMPTY = "Für dich steht heute nichts an."
    const val SAVE = "Speichern"
    const val CANCEL = "Abbrechen"
    const val REMOVE_DATE = "Datum entfernen"

    /** "Fr., 27.11., 08:00", without the time when it is midnight. */
    fun whenText(o: Occurrence, zone: ZoneId = ZoneId.systemDefault()): String {
        val date = o.date ?: return ""
        val day = DateTimeFormatter.ofPattern("EE, d.M.", Locale.GERMAN).format(LocalDate.parse(date))
        val time = o.at?.let { DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(it).atZone(zone)) }
        return if (time != null && time != "00:00") "$day, $time" else day
    }
}

const val UNDATED = "1970-01-01"

data class TodosState(
    val view: TodoView = TodoView.Today,
    val mine: Boolean = true,
    val list: List<Occurrence>? = null,
    val members: List<Member> = emptyList(),
    val error: String? = null,
)

class TodosModel(private val api: TodosApi, val me: Member) {
    private val _state = MutableStateFlow(TodosState())
    val state: StateFlow<TodosState> = _state

    suspend fun load() {
        val s = _state.value
        try {
            val members = s.members.ifEmpty { api.members() }
            _state.value = s.copy(list = api.todos(s.view.query, s.mine), members = members, error = null)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.value = s.copy(error = TodoText.GENERIC)
        }
    }

    suspend fun setView(v: TodoView) { _state.update { it.copy(view = v) }; load() }
    suspend fun setMine(m: Boolean) { _state.update { it.copy(mine = m) }; load() }
    suspend fun onLive(e: LiveEvent) { if (e == LiveEvent.Todos || e == LiveEvent.Connected) load() }

    /** Shown at once; goes back if the server says no. */
    suspend fun toggle(o: Occurrence) {
        val date = o.date ?: UNDATED
        val before = _state.value.list
        _state.update { s -> s.copy(error = null, list = s.list?.map { if (it === o) it.copy(done = if (o.done == null) app.stellwall.api.Done(me.id, "now") else null) else it }) }
        try {
            if (o.done != null) api.undone(o.todoId, date) else api.done(o.todoId, date)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(list = before, error = TodoText.GENERIC) }
        }
    }

    suspend fun rule(id: String): TodoRule? = try {
        api.todo(id)
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        _state.update { it.copy(error = TodoText.GENERIC) }
        null
    }

    /** Error to show, or null when saved. */
    suspend fun save(rule: TodoRule?, d: TodoDraft): String? {
        val r = TodoForms.body(d, isCreator = rule == null || rule.createdBy == me.id)
        val body = r.body ?: return r.error
        return try {
            if (rule == null) api.createTodo(body) else api.updateTodo(rule.id, body)
            load()
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            TodoText.INVALID
        }
    }

    suspend fun delete(rule: TodoRule) {
        try {
            api.deleteTodo(rule.id)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(error = TodoText.GENERIC) }
        }
    }

    suspend fun suggestions(q: String): List<String> = if (q.isBlank()) emptyList() else (quietly { api.todoSuggestions(q.trim()) } ?: emptyList()).filter { it != q }
}

data class TodoDraft(
    val title: String,
    val visibility: Visibility,
    val assignees: List<String>,
    val startDate: LocalDate?,
    val time: LocalTime?,
    val repeat: String,
    val weekdays: Set<Int>,
    val until: LocalDate?,
    val needsConfirm: Boolean,
    val reminders: List<Int>,
) {
    companion object {
        fun of(rule: TodoRule?) = TodoDraft(
            title = rule?.title ?: "",
            visibility = rule?.visibility ?: Visibility(true, emptyList()),
            assignees = rule?.assignees ?: emptyList(),
            startDate = rule?.startDate?.let(LocalDate::parse),
            time = rule?.time?.let(LocalTime::parse),
            repeat = rule?.recurrence?.kind ?: "none",
            weekdays = rule?.recurrence?.weekdays?.toSet() ?: emptySet(),
            until = rule?.until?.let(LocalDate::parse),
            needsConfirm = rule?.needsConfirm ?: false,
            reminders = rule?.reminders ?: emptyList(),
        )
    }
}

/** The web app's to-do form rules (web/src/pages/Todos.tsx). */
object TodoForms {
    data class Result(val body: TodoBody?, val error: String?)

    fun body(d: TodoDraft, isCreator: Boolean): Result {
        if (d.title.isBlank()) return Result(null, TodoText.INVALID)
        val rec = when (d.repeat) {
            "weekly" -> if (d.weekdays.isEmpty()) return Result(null, TodoText.PICK_DAY) else Recurrence("weekly", weekdays = d.weekdays.sorted())
            "monthly" -> Recurrence("monthly", day = d.startDate?.dayOfMonth ?: 1)
            else -> Recurrence(d.repeat)
        }
        if (rec.kind != "none" && d.startDate == null) return Result(null, TodoText.NEEDS_DATE)
        return Result(
            TodoBody(
                title = d.title.trim(),
                assignees = d.assignees,
                startDate = d.startDate?.toString(),
                time = d.time?.let { "%02d:%02d".format(it.hour, it.minute) },
                recurrence = rec,
                until = if (rec.kind == "none") null else d.until?.toString(),
                needsConfirm = d.needsConfirm,
                reminders = d.reminders,
                visibility = if (isCreator) d.visibility else null,
            ),
            null,
        )
    }
}
