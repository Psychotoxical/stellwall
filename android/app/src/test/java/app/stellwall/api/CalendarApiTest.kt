package app.stellwall.api

import java.time.Instant
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class CalendarApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun api() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `the calendar mixes events and birthdays`() = runTest {
        server.enqueue(Contract.response("calendar"))
        val list = api().calendar(Instant.parse("2026-11-29T23:00:00Z"), Instant.parse("2026-12-13T23:00:00Z"), mine = true)
        val req = server.takeRequest()
        assertEquals("/api/calendar", req.url.encodedPath)
        assertEquals("2026-11-29T23:00:00Z", req.url.queryParameter("from"))
        assertEquals("1", req.url.queryParameter("mine"))
        val birthday = list.filterIsInstance<CalendarInstance.Birthday>().single()
        assertEquals("Oma", birthday.title)
        assertEquals(76, birthday.age)
        val moved = list.filterIsInstance<CalendarInstance.Event>().first { it.changed }
        assertEquals("Training (Halle 2)", moved.title)
        assertEquals(true, moved.series)
        assertEquals(true, list.filterIsInstance<CalendarInstance.Event>().first { it.title == "Ausflug" }.allDay)
    }

    @Test fun `an event and the birthdays parse`() = runTest {
        server.enqueue(Contract.response("event"))
        server.enqueue(Contract.response("birthdays"))
        val ev = api().event("e1")
        assertEquals("FREQ=WEEKLY;BYDAY=TU", ev.rrule)
        assertEquals("2026-12-01", ev.startDate)
        val b = api().birthdays().single()
        assertEquals(1950, b.year)
        assertEquals(1, b.remindDays)
    }

    @Test fun `a change says which occurrences`() = runTest {
        server.enqueue(Contract.response("event-moved-once"))
        api().updateEvent("e1", "one", "2026-12-08", buildJsonObject { put("title", JsonPrimitive("Training (Halle 2)")) })
        val req = server.takeRequest()
        assertEquals("PATCH", req.method)
        assertEquals("one", req.url.queryParameter("scope"))
        assertEquals("2026-12-08", req.url.queryParameter("date"))
        assertEquals("""{"title":"Training (Halle 2)"}""", req.body?.utf8())
    }

    @Test fun `deleting one occurrence, and refused deletes`() = runTest {
        server.enqueue(Contract.response("event-deleted-once"))
        server.enqueue(Contract.response("event-not-creator"))
        api().deleteEvent("e1", "one", "2026-12-01")
        val req = server.takeRequest()
        assertEquals("DELETE", req.method)
        assertEquals("one", req.url.queryParameter("scope"))
        try {
            api().deleteEvent("e1", "all", null)
            throw AssertionError("expected ApiException")
        } catch (e: ApiException) {
            assertEquals("not_creator", e.code)
        }
    }
}
