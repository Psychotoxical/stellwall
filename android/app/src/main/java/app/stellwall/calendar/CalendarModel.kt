package app.stellwall.calendar

import app.stellwall.api.Birthday
import app.stellwall.api.BirthdayChange
import app.stellwall.api.CalendarApi
import app.stellwall.api.CalendarInstance
import app.stellwall.api.EventDto
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

data class CalState(
    val view: View,
    val sel: LocalDate,
    val today: LocalDate,
    val mine: Boolean = false,
    val days: Map<LocalDate, List<CalendarInstance>> = emptyMap(),
    val members: List<Member> = emptyList(),
    val loaded: Boolean = false,
    val error: String? = null,
) {
    val range: Pair<LocalDate, LocalDate> get() = Days.range(view, sel, today)
    val title: String
        get() = when (view) {
            View.Month -> Days.monthTitle(sel)
            View.Week -> Days.weekTitle(range.first)
            View.Upcoming -> View.Upcoming.label
        }
}

/** An open event form: the event (null for a new one), the occurrence tapped, and what the form started with. */
data class EventForm(val event: EventDto?, val instance: CalendarInstance.Event?, val start0: EventDraft, val isCreator: Boolean) {
    val isSeries get() = event?.rrule != null
}

class CalendarModel(
    private val api: CalendarApi,
    val me: Member,
    private val zone: ZoneId = ZoneId.systemDefault(),
    private val today: () -> LocalDate = { LocalDate.now() },
    private val now: () -> LocalDateTime = { LocalDateTime.now() },
) {
    private val _state = MutableStateFlow(CalState(View.Month, today(), today()))
    val state: StateFlow<CalState> = _state

    suspend fun load() {
        val s = _state.value.copy(today = today())
        val (from, to) = Days.range(s.view, s.sel, s.today)
        try {
            val members = s.members.ifEmpty { api.members() }
            val list = api.calendar(Days.instant(from, zone), Days.instant(to, zone), s.mine)
            _state.value = s.copy(days = Days.byDay(list, zone), members = members, loaded = true, error = null)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.value = s.copy(loaded = true, error = CalText.GENERIC)
        }
    }

    suspend fun setView(v: View) { _state.update { it.copy(view = v) }; load() }
    suspend fun setMine(mine: Boolean) { _state.update { it.copy(mine = mine) }; load() }

    /** Picking a day in the month grid needs no reload while it stays in the shown weeks. */
    suspend fun select(d: LocalDate) {
        val before = _state.value.range
        _state.update { it.copy(sel = d) }
        if (_state.value.range != before) load()
    }

    suspend fun step(n: Int) {
        val s = _state.value
        select(if (s.view == View.Month) YearMonth.from(s.sel).plusMonths(n.toLong()).atDay(1) else s.sel.plusWeeks(n.toLong()))
    }

    suspend fun goToday() = select(today())

    suspend fun onLive(e: LiveEvent) {
        if (e == LiveEvent.Calendar || e == LiveEvent.Connected) load()
    }

    fun new(date: LocalDate) = EventForm(null, null, EventForms.initial(null, null, date, me.id, now(), zone), isCreator = true)

    /** Null when the event could not be fetched; the error then shows on the page. */
    suspend fun open(i: CalendarInstance.Event): EventForm? = try {
        val ev = api.event(i.eventId)
        EventForm(ev, i, EventForms.initial(ev, i, i.date.let(LocalDate::parse), me.id, now(), zone), ev.createdBy == me.id)
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        _state.update { it.copy(error = CalText.GENERIC) }
        null
    }

    /** Returns the error to show, or null when saved. [scope] is asked for series only. */
    suspend fun save(form: EventForm, d: EventDraft, scope: Scope?): String? {
        EventForms.validate(d, zone)?.let { return it }
        return run {
            val ev = form.event
            if (ev == null) {
                api.createEvent(EventForms.createBody(d, zone))
            } else {
                val sc = if (form.isSeries) scope ?: Scope.All else Scope.All
                api.updateEvent(ev.id, sc.query, if (form.isSeries) form.instance?.date ?: ev.startDate else null, EventForms.updateBody(ev, form.start0, d, sc, form.isCreator, zone))
            }
        }
    }

    suspend fun delete(form: EventForm, scope: Scope): String? {
        val ev = form.event ?: return null
        return run { api.deleteEvent(ev.id, scope.query, if (form.isSeries) form.instance?.date ?: ev.startDate else null) }
    }

    private suspend fun run(block: suspend () -> Unit): String? = try {
        block()
        load()
        null
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        CalText.GENERIC
    }
}

class BirthdaysModel(private val api: CalendarApi, val me: Member, private val today: () -> LocalDate = { LocalDate.now() }) {
    private val _list = MutableStateFlow<List<Birthday>?>(null)
    val list: StateFlow<List<Birthday>?> = _list
    var members: List<Member> = emptyList()
        private set

    suspend fun load() {
        try {
            if (members.isEmpty()) members = api.members()
            _list.value = api.birthdays()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }

    /** "wird 76": the age at the next birthday, counted from today. */
    fun turns(b: Birthday): String? {
        val y = b.year ?: return null
        val t = today()
        val past = b.month < t.monthValue || (b.month == t.monthValue && b.day < t.dayOfMonth)
        return CalText.turns(t.year - y + if (past) 1 else 0)
    }

    suspend fun save(existing: Birthday?, change: BirthdayChange): String? {
        if (change.day > YearMonth.of(2024, change.month).lengthOfMonth()) return CalText.NO_SUCH_DAY
        if (change.name.isBlank()) return EventForms.INVALID
        val isCreator = existing == null || existing.createdBy == me.id
        val body = change.copy(name = change.name.trim(), visibility = if (isCreator) change.visibility else null)
        return try {
            if (existing == null) api.createBirthday(body) else api.updateBirthday(existing.id, body)
            load()
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (e is app.stellwall.api.ApiException && e.status == 400) EventForms.INVALID else CalText.GENERIC
        }
    }

    suspend fun delete(b: Birthday) {
        try {
            api.deleteBirthday(b.id)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }
}

/** The web app's calendar and birthday wording (web/src/text/de.ts). */
object CalText {
    const val PAGE = "Kalender"
    const val MINE = "Meine"
    const val ALL = "Alle"
    const val PREV = "Zurück"
    const val NEXT = "Weiter"
    const val TODAY = "Heute"
    const val NEW = "Neuer Termin"
    const val EDIT = "Termin bearbeiten"
    const val BIRTHDAYS = "Geburtstage"
    const val IMPORT = "Termine aus Google oder Apple importieren"
    const val ALL_DAY = "Ganztägig"
    const val ALL_DAY_SHORT = "ganztägig"
    const val TITLE = "Was steht an?"
    const val FROM = "Von"
    const val TO = "Bis"
    const val DATE = "Datum"
    const val TIME = "Uhrzeit"
    const val LOCATION = "Ort (optional)"
    const val NOTES = "Notiz (optional)"
    const val FOR_WHOM = "Für wen ist der Termin?"
    const val SEE_ALL = "Alle dürfen ihn sehen"
    const val SEE_ALL_SUB = "Sonst sehen ihn nur die, für die er ist."
    const val REPEAT = "Wiederholen"
    const val REMINDERS = "Erinnern"
    val REMINDER_CHIPS = listOf(1440 to "1 Tag vorher", 60 to "1 Stunde vorher", 15 to "15 Minuten vorher")
    const val REMINDER_LATER = "Erinnerungen kommen aufs Handy, sobald Benachrichtigungen erlaubt sind."
    const val DELETE = "Termin löschen"
    const val SCOPE_TITLE = "Wiederkehrender Termin"
    const val SCOPE_SAVE = "Was soll sich ändern?"
    const val SCOPE_DELETE = "Was soll gelöscht werden?"
    const val DAY_EMPTY = "An diesem Tag steht nichts an."
    const val WEEK_EMPTY = "In dieser Woche steht nichts an."
    const val UPCOMING_EMPTY = "In den nächsten 30 Tagen steht nichts an."
    const val GENERIC = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    const val SAVE = "Speichern"
    const val CANCEL = "Abbrechen"
    val WEEKDAYS = listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
    fun more(n: Int) = "+$n"
    fun turns(age: Int) = "wird $age"

    const val B_PAGE = "Geburtstage"
    const val B_TITLE = "Wer hat wann Geburtstag?"
    const val B_NEW = "Neuer Geburtstag"
    const val B_EDIT = "Geburtstag bearbeiten"
    const val B_NAME = "Name"
    const val B_DAY = "Tag"
    const val B_MONTH = "Monat"
    const val B_YEAR = "Geburtsjahr (optional)"
    const val B_YEAR_HINT = "Mit Jahr zeigt der Kalender, wie alt jemand wird."
    val MONTHS = listOf("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember")
    const val B_REMIND = "Erinnern"
    val REMIND_DAYS = listOf(0 to "am Tag selbst", 1 to "1 Tag vorher", 3 to "3 Tage vorher", 7 to "1 Woche vorher", 14 to "2 Wochen vorher")
    const val B_REMIND_WHO = "Wer wird erinnert?"
    const val B_EMPTY = "Noch keine Geburtstage eingetragen."
    const val B_DELETE = "Geburtstag löschen"
    const val NO_SUCH_DAY = "Diesen Tag gibt es in dem Monat nicht."
    fun whenText(day: Int, month: Int) = "$day. ${MONTHS[month - 1]}"
}
