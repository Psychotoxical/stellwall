package app.stellwall.calendar

import app.stellwall.api.Birthday
import app.stellwall.api.BirthdayChange
import app.stellwall.api.CalendarApi
import app.stellwall.api.CalendarInstance
import app.stellwall.api.EventDto
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.Visibility
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeCalendar : CalendarApi {
    val calls = mutableListOf<String>()
    var bodies = mutableListOf<JsonObject>()
    val series = EventDto("s1", "Training", "", "", false, "2026-12-01T17:00:00.000Z", "2026-12-01T18:30:00.000Z", "2026-12-01", "2026-12-01", "FREQ=WEEKLY;BYDAY=TU", listOf("sam"), false, "me", emptyList(), false)
    var list: List<CalendarInstance> = listOf(
        CalendarInstance.Event("s1", "2026-12-08", "2026-12-08T17:00:00.000Z", "2026-12-08T18:30:00.000Z", false, "2026-12-08", "Training", "", listOf("sam"), true, "me", false),
        CalendarInstance.Birthday("b1", "2026-12-03", "2026-12-02T23:00:00.000Z", true, "2026-12-03", "Oma", 76),
    )
    var birthdays = mutableListOf(Birthday("b1", "Oma", 12, 3, 1950, Visibility(true, emptyList()), 1, listOf("me"), "me"))
    override suspend fun members() = listOf(Member("me", "alex", "Alex", "admin", "person-mint", "salbei"), Member("sam", "sam", "Sam", "member", "person-lilac", "flieder"))
    override suspend fun calendar(from: Instant, to: Instant, mine: Boolean) = list.also { calls += "calendar:$from:$to:$mine" }
    override suspend fun event(id: String) = series
    override suspend fun createEvent(body: JsonObject) = series.also { calls += "create"; bodies += body }
    override suspend fun updateEvent(id: String, scope: String, date: String?, body: JsonObject) = series.also { calls += "update:$id:$scope:$date"; bodies += body }
    override suspend fun deleteEvent(id: String, scope: String, date: String?) { calls += "delete:$id:$scope:$date" }
    override suspend fun birthdays() = birthdays.toList()
    override suspend fun createBirthday(body: BirthdayChange) = Birthday("b2", body.name, body.month, body.day, body.year, body.visibility ?: Visibility(true, emptyList()), body.remindDays, body.remindWho, "me").also { birthdays += it; calls += "createBirthday" }
    override suspend fun updateBirthday(id: String, body: BirthdayChange) = birthdays.first().also { calls += "updateBirthday:${body.visibility}" }
    override suspend fun deleteBirthday(id: String) { calls += "deleteBirthday:$id" }
}

class CalendarModelTest {
    private val zone = ZoneId.of("Europe/Berlin")
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val today = LocalDate.of(2026, 12, 2)

    private fun model(f: FakeCalendar) = CalendarModel(f, me, zone, today = { today }, now = { LocalDateTime.of(2026, 12, 2, 9, 0) })

    @Test fun `month view loads six weeks, stepping moves a month`() = runTest {
        val f = FakeCalendar()
        val m = model(f)
        m.load()
        assertEquals("calendar:2026-11-29T23:00:00Z:2027-01-10T23:00:00Z:false", f.calls.last())
        assertEquals(listOf("Oma"), m.state.value.days[LocalDate.of(2026, 12, 3)]?.map { it.title })
        m.step(1)
        assertEquals(LocalDate.of(2027, 1, 1), m.state.value.sel)
        m.setView(View.Week)
        assertEquals("calendar:2026-12-27T23:00:00Z:2027-01-03T23:00:00Z:false", f.calls.last())
        m.setMine(true)
        assertTrue(f.calls.last().endsWith(":true"))
        m.goToday()
        assertEquals(today, m.state.value.sel)
    }

    @Test fun `live calendar hints reload, others do not`() = runTest {
        val f = FakeCalendar()
        val m = model(f)
        m.load()
        f.calls.clear()
        m.onLive(LiveEvent.Lists)
        m.onLive(LiveEvent.Calendar)
        assertEquals(1, f.calls.size)
    }

    @Test fun `saving one occurrence names its series date`() = runTest {
        val f = FakeCalendar()
        val m = model(f)
        m.load()
        val inst = f.list[0] as CalendarInstance.Event
        val form = m.open(inst)!!
        val d = form.start0.copy(title = "Training (Halle 2)")
        assertNull(m.save(form, d, Scope.One))
        assertEquals("update:s1:one:2026-12-08", f.calls.last { it.startsWith("update") })
    }

    @Test fun `a new event is created, a bad one is not sent`() = runTest {
        val f = FakeCalendar()
        val m = model(f)
        val form = m.new(LocalDate.of(2026, 12, 4))
        assertEquals(EventForms.INVALID, m.save(form, form.start0, null))
        assertTrue("create" !in f.calls)
        assertNull(m.save(form, form.start0.copy(title = "Zahnarzt"), null))
        assertTrue("create" in f.calls)
    }

    @Test fun `deleting the whole series names the tapped occurrence`() = runTest {
        val f = FakeCalendar()
        val m = model(f)
        val form = m.open(f.list[0] as CalendarInstance.Event)!!
        m.delete(form, Scope.All)
        assertEquals("delete:s1:all:2026-12-08", f.calls.last { it.startsWith("delete") })
    }

    @Test fun `birthdays - no 31st of April, the age they turn, only creators send who sees it`() = runTest {
        val f = FakeCalendar()
        val b = BirthdaysModel(f, me, today = { today })
        b.load()
        assertEquals("wird 76", b.turns(f.birthdays[0]))
        assertEquals("Diesen Tag gibt es in dem Monat nicht.", b.save(null, BirthdayChange("Opa", 31, 4, null, 1, listOf("me"), Visibility(true, emptyList()))))
        assertNull(b.save(null, BirthdayChange("Opa", 30, 4, null, 1, listOf("me"), Visibility(true, emptyList()))))
        val notMine = f.birthdays[0].copy(createdBy = "sam")
        b.save(notMine, BirthdayChange("Oma", 3, 12, 1950, 3, listOf("me"), Visibility(false, listOf("me"))))
        assertEquals("updateBirthday:null", f.calls.last())
    }
}
