package app.stellwall.calendar

import app.stellwall.api.CalendarInstance
import app.stellwall.api.EventDto
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RulesTest {
    private val tue = LocalDate.of(2026, 12, 1)

    @Test fun `simple rules follow the start day, as in shared`() {
        assertEquals("FREQ=WEEKLY;BYDAY=TU", Rules.simple(Repeat.Weekly, tue))
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", Rules.simple(Repeat.Biweekly, tue))
        assertEquals("FREQ=MONTHLY;BYMONTHDAY=1", Rules.simple(Repeat.Monthly, tue))
        assertEquals("FREQ=YEARLY", Rules.simple(Repeat.Yearly, tue))
    }

    @Test fun `a rule reads back as its kind, an end date does not matter`() {
        assertEquals(Repeat.None, Rules.kind(null))
        assertEquals(Repeat.Weekly, Rules.kind("FREQ=WEEKLY;BYDAY=TU;UNTIL=20270101"))
        assertEquals(Repeat.Biweekly, Rules.kind("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"))
        assertEquals(Repeat.Monthly, Rules.kind("FREQ=MONTHLY;BYMONTHDAY=15"))
        assertEquals(Repeat.Custom, Rules.kind("FREQ=DAILY;COUNT=3"))
    }

    @Test fun `rules in words`() {
        assertEquals("jeden Dienstag", Rules.describe("FREQ=WEEKLY;BYDAY=TU"))
        assertEquals("alle 2 Wochen am Freitag", Rules.describe("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"))
        assertEquals("monatlich am 15.", Rules.describe("FREQ=MONTHLY;BYMONTHDAY=15"))
        assertEquals("jährlich", Rules.describe("FREQ=YEARLY"))
        assertEquals("eigene Wiederholung", Rules.describe("FREQ=DAILY"))
    }
}

class DaysTest {
    private val berlin = ZoneId.of("Europe/Berlin")

    private fun ev(id: String, start: String, end: String, allDay: Boolean, endDate: String) =
        CalendarInstance.Event(id, start.take(10), start, end, allDay, endDate, id, "", listOf("a"), false, "a", false)

    @Test fun `weeks start on Monday, the month grid shows six of them`() {
        assertEquals(LocalDate.of(2026, 11, 23), Days.weekStart(LocalDate.of(2026, 11, 29)))
        assertEquals(LocalDate.of(2026, 11, 30), Days.weekStart(LocalDate.of(2026, 11, 30)))
        val (from, to) = Days.range(View.Month, LocalDate.of(2026, 12, 17), LocalDate.of(2026, 12, 17))
        assertEquals(LocalDate.of(2026, 11, 30), from)
        assertEquals(LocalDate.of(2027, 1, 11), to)
        assertEquals(LocalDate.of(2026, 12, 14) to LocalDate.of(2026, 12, 21), Days.range(View.Week, LocalDate.of(2026, 12, 17), LocalDate.of(2026, 12, 17)))
        assertEquals(LocalDate.of(2026, 12, 17) to LocalDate.of(2027, 1, 16), Days.range(View.Upcoming, LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 17)))
    }

    @Test fun `a multi-day all-day event is on each of its days, all-day first, then by time`() {
        val trip = ev("trip", "2026-12-04T23:00:00.000Z", "2026-12-06T23:00:00.000Z", true, "2026-12-06")
        val dentist = ev("dentist", "2026-12-05T14:30:00.000Z", "2026-12-05T15:30:00.000Z", false, "2026-12-05")
        val early = ev("early", "2026-12-05T07:00:00.000Z", "2026-12-05T08:00:00.000Z", false, "2026-12-05")
        val days = Days.byDay(listOf(dentist, trip, early), berlin)
        assertEquals(listOf("trip", "early", "dentist"), days.getValue(LocalDate.of(2026, 12, 5)).map { it.title })
        assertEquals(listOf("trip"), days.getValue(LocalDate.of(2026, 12, 6)).map { it.title })
        assertFalse(days.containsKey(LocalDate.of(2026, 12, 7)))
    }

    @Test fun `times and labels`() {
        assertEquals("15:30", Days.hhmm("2026-12-02T14:30:00.000Z", berlin))
        assertEquals("Mittwoch, 2. Dezember", Days.dayLabel(LocalDate.of(2026, 12, 2)))
        assertEquals("Dezember 2026", Days.monthTitle(LocalDate.of(2026, 12, 2)))
        assertEquals("30. Nov. – 6. Dez.", Days.weekTitle(LocalDate.of(2026, 11, 30)))
    }
}

class EventFormTest {
    private val zone = ZoneId.of("Europe/Berlin")
    private val now = LocalDateTime.of(2026, 11, 27, 10, 20)

    private val series = EventDto(
        "s1", "Training", "", "", false, "2026-12-01T17:00:00.000Z", "2026-12-01T18:30:00.000Z", "2026-12-01", "2026-12-01",
        "FREQ=WEEKLY;BYDAY=TU", listOf("sam"), false, "me", emptyList(), false,
    )
    private val secondTuesday = CalendarInstance.Event(
        "s1", "2026-12-08", "2026-12-08T17:00:00.000Z", "2026-12-08T18:30:00.000Z", false, "2026-12-08", "Training", "", listOf("sam"), true, "me", false,
    )

    @Test fun `a new event starts at the next hour, for me`() {
        val d = EventForms.initial(null, null, LocalDate.of(2026, 12, 3), "me", now, zone)
        assertEquals(LocalDate.of(2026, 12, 3), d.startDate)
        assertEquals(LocalTime.of(11, 0), d.startTime)
        assertEquals(LocalTime.of(12, 0), d.endTime)
        assertEquals(listOf("me"), d.forWhom)
        assertEquals(Repeat.None, d.repeat)
    }

    @Test fun `an occurrence opens with its own day and time`() {
        val d = EventForms.initial(series, secondTuesday, LocalDate.of(2026, 12, 8), "me", now, zone)
        assertEquals(LocalDate.of(2026, 12, 8), d.startDate)
        assertEquals(LocalTime.of(18, 0), d.startTime)
        assertEquals(LocalTime.of(19, 30), d.endTime)
        assertEquals(Repeat.Weekly, d.repeat)
    }

    @Test fun `what is wrong with a draft`() {
        val ok = EventForms.initial(null, null, LocalDate.of(2026, 12, 3), "me", now, zone).copy(title = "Zahnarzt")
        assertNull(EventForms.validate(ok))
        assertEquals("Bitte die Eingaben prüfen.", EventForms.validate(ok.copy(title = " ")))
        assertEquals("Wähle mindestens eine Person.", EventForms.validate(ok.copy(forWhom = emptyList())))
        assertEquals("Das Ende liegt vor dem Anfang.", EventForms.validate(ok.copy(endTime = LocalTime.of(10, 0))))
        assertNull(EventForms.validate(ok.copy(allDay = true, endDate = ok.startDate)))
    }

    @Test fun `a new timed event is sent with instants, an all-day one with dates`() {
        val d = EventForms.initial(null, null, LocalDate.of(2026, 12, 3), "me", now, zone).copy(title = " Zahnarzt ", repeat = Repeat.Weekly)
        val body = EventForms.createBody(d, zone)
        assertEquals("Zahnarzt", body.str("title"))
        assertEquals("2026-12-03T10:00:00Z", body.str("start"))
        assertEquals("2026-12-03T11:00:00Z", body.str("end"))
        assertEquals("FREQ=WEEKLY;BYDAY=TH", body.str("rrule"))
        val allDay = EventForms.createBody(d.copy(allDay = true, endDate = LocalDate.of(2026, 12, 4), repeat = Repeat.None), zone)
        assertEquals("2026-12-03", allDay.str("startDate"))
        assertEquals("2026-12-04", allDay.str("endDate"))
        assertEquals(null, allDay["start"])
        assertEquals("null", allDay["rrule"].toString())
    }

    @Test fun `changing one occurrence sends only title, place and its own time`() {
        val start0 = EventForms.initial(series, secondTuesday, LocalDate.of(2026, 12, 8), "me", now, zone)
        val d = start0.copy(title = "Training (Halle 2)", startTime = LocalTime.of(18, 30), endTime = LocalTime.of(20, 0), notes = "ignored for one")
        val body = EventForms.updateBody(series, start0, d, Scope.One, isCreator = true, zone = zone)
        assertEquals(setOf("title", "allDay", "start", "end"), body.keys)
        assertEquals("2026-12-08T17:30:00Z", body.str("start"))
    }

    @Test fun `moving the whole series shifts it by the same amount`() {
        val start0 = EventForms.initial(series, secondTuesday, LocalDate.of(2026, 12, 8), "me", now, zone)
        val d = start0.copy(startDate = LocalDate.of(2026, 12, 9), endDate = LocalDate.of(2026, 12, 9))
        val body = EventForms.updateBody(series, start0, d, Scope.All, isCreator = true, zone = zone)
        assertEquals("2026-12-02T17:00:00Z", body.str("start"))
        assertEquals("2026-12-02T18:30:00Z", body.str("end"))
        assertEquals("FREQ=WEEKLY;BYDAY=WE", body.str("rrule"))
    }

    @Test fun `this and following starts the new part at the occurrence`() {
        val start0 = EventForms.initial(series, secondTuesday, LocalDate.of(2026, 12, 8), "me", now, zone)
        val d = start0.copy(startTime = LocalTime.of(19, 0), endTime = LocalTime.of(20, 0))
        val body = EventForms.updateBody(series, start0, d, Scope.Following, isCreator = true, zone = zone)
        assertEquals("2026-12-08T18:00:00Z", body.str("start"))
        assertFalse(body.containsKey("rrule"))
    }

    @Test fun `series-wide changes skip one occurrence, only creators delete more`() {
        val start0 = EventForms.initial(series, secondTuesday, LocalDate.of(2026, 12, 8), "me", now, zone)
        assertTrue(EventForms.seriesOnly(start0, start0.copy(notes = "neu")))
        assertFalse(EventForms.seriesOnly(start0, start0.copy(title = "neu")))
        assertEquals(listOf(Scope.Following, Scope.All), EventForms.scopes(Ask.Save, isCreator = true, seriesOnly = true))
        assertEquals(listOf(Scope.One, Scope.Following, Scope.All), EventForms.scopes(Ask.Save, isCreator = false, seriesOnly = false))
        assertEquals(listOf(Scope.One), EventForms.scopes(Ask.Delete, isCreator = false, seriesOnly = false))
    }

    private fun JsonObject.str(k: String) = (getValue(k) as JsonPrimitive).jsonPrimitive.content
}
