package app.stellwall.start

import app.stellwall.calendar.FakeCalendar
import app.stellwall.meals.FakeMeals
import app.stellwall.todos.FakeTodos
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class TodayModelTest {
    @Test fun `today brings lunch, my events and my to-dos`() = runTest {
        val cal = FakeCalendar()
        val todos = FakeTodos()
        val m = TodayModel(todos, cal, FakeMeals(), ZoneId.of("Europe/Berlin"), today = { LocalDate.of(2026, 12, 2) })
        m.load()
        assertEquals("Reste", m.state.value.lunch?.text)
        assertEquals("calendar:2026-12-01T23:00:00Z:2026-12-02T23:00:00Z:true", cal.calls.last())
        assertEquals("todos:today:true", todos.calls.last())
        m.toggle(todos.list[0])
        assertEquals("done:t1:2026-11-27", todos.calls.first { it.startsWith("done") })
    }

    @Test fun `a part that fails does not take the others with it`() = runTest {
        val meals = object : app.stellwall.api.MealsApi by FakeMeals() {
            override suspend fun meals(week: String): List<app.stellwall.api.Meal> = throw IOException("down")
        }
        val m = TodayModel(FakeTodos(), FakeCalendar(), meals, ZoneId.of("Europe/Berlin"), today = { LocalDate.of(2026, 12, 2) })
        m.load()
        assertEquals(null, m.state.value.lunch)
        assertEquals(2, m.state.value.todos.size)
    }
}
