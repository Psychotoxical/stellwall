package app.stellwall.start

import app.stellwall.api.CalendarApi
import app.stellwall.api.CalendarInstance
import app.stellwall.api.LiveEvent
import app.stellwall.api.Meal
import app.stellwall.api.MealsApi
import app.stellwall.api.Member
import app.stellwall.api.Occurrence
import app.stellwall.api.TodosApi
import app.stellwall.calendar.Days
import app.stellwall.todos.UNDATED
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class Today(
    val lunch: Meal? = null,
    val events: List<CalendarInstance> = emptyList(),
    val todos: List<Occurrence> = emptyList(),
    val members: List<Member> = emptyList(),
    val loaded: Boolean = false,
)

/** "Heute für dich" on Start: today's lunch, my events today and my to-dos for today. Each part may fail alone. */
class TodayModel(
    private val todos: TodosApi,
    private val calendar: CalendarApi,
    private val meals: MealsApi,
    private val zone: ZoneId = ZoneId.systemDefault(),
    private val today: () -> LocalDate = { LocalDate.now() },
) {
    private val _state = MutableStateFlow(Today())
    val state: StateFlow<Today> = _state

    private suspend fun <T> part(block: suspend () -> T, fallback: T): T = try {
        block()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        fallback
    }

    suspend fun load() {
        val d = today()
        val s = _state.value
        _state.value = Today(
            lunch = part({ meals.meals(Days.weekStart(d).toString()).firstOrNull { it.date == d.toString() } }, s.lunch),
            events = part({ calendar.calendar(Days.instant(d, zone), Days.instant(d.plusDays(1), zone), mine = true) }, s.events),
            todos = part({ todos.todos("today", mine = true) }, s.todos),
            members = s.members.ifEmpty { part({ todos.members() }, emptyList()) },
            loaded = true,
        )
    }

    suspend fun onLive(e: LiveEvent) {
        if (e != LiveEvent.Lists && e !is LiveEvent.List) load()
    }

    suspend fun toggle(o: Occurrence) {
        part({ if (o.done != null) todos.undone(o.todoId, o.date ?: UNDATED) else todos.done(o.todoId, o.date ?: UNDATED) }, Unit)
        load()
    }
}
