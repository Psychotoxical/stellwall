package app.stellwall.start

import app.stellwall.api.BoardRow
import app.stellwall.api.LiveEvent
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class StartTest {
    private val berlin = ZoneId.of("Europe/Berlin")

    @Test fun `board lines read like the web app`() {
        val shop = BoardRow.Shopping("s", "Sam", "l1", "Einkauf", 2, "2026-11-27T10:02:00.000Z", listOf("a", "b"))
        assertEquals("Sam hat 2 Sachen auf „Einkauf“ gesetzt", StartText.line(shop, berlin))
        assertEquals("Sam hat 1 Sache auf „Einkauf“ gesetzt", StartText.line(shop.copy(count = 1), berlin))
        assertEquals("Sam hat dir „Müll rausbringen“ gegeben", StartText.line(BoardRow.Todo("s", "Sam", "t1", "Müll rausbringen", "2026-11-27T10:03:00.000Z"), berlin))
        val event = BoardRow.Event("s", "Sam", "e1", "Zahnarzt", "2026-12-02T14:30:00.000Z", false, "2026-11-27T10:04:00.000Z")
        assertEquals("Sam hat dir einen Termin eingetragen: Zahnarzt, Mi., 2.12. 15:30", StartText.line(event, berlin))
        assertEquals("Sam hat dir einen Termin eingetragen: Zahnarzt, Mi., 2.12.", StartText.line(event.copy(allDay = true, start = "2026-12-02T00:00:00.000Z"), berlin))
    }

    @Test fun `area, time and count`() {
        assertEquals("Kalender", StartText.area(BoardRow.Event("s", "Sam", "e1", "Zahnarzt", "2026-12-02T14:30:00.000Z", false, "2026-11-27T10:04:00.000Z")))
        assertEquals("11:04", StartText.time("2026-11-27T10:04:00.000Z", berlin))
        assertEquals("alles gesehen", StartText.count(0))
        assertEquals("3 neu", StartText.count(3))
        assertEquals("Freitag, 27. November", StartText.today(java.time.LocalDate.of(2026, 11, 27)))
    }

    @Test fun `the board loads and follows live hints`() = runTest {
        var calls = 0
        val rows = listOf(BoardRow.Todo("s", "Sam", "t1", "Müll rausbringen", "2026-11-27T10:03:00.000Z"))
        val m = StartModel(board = { calls++; rows })
        m.load()
        assertEquals(rows, m.rows.value)
        m.onLive(LiveEvent.Todos)
        m.onLive(LiveEvent.Meals)
        assertEquals(2, calls)
    }
}
