package app.stellwall.todos

import app.stellwall.api.ApiClient
import app.stellwall.api.Contract
import app.stellwall.api.MemoryCookieStore
import app.stellwall.api.Member
import app.stellwall.api.Occurrence
import app.stellwall.api.Recurrence
import app.stellwall.api.TodoBody
import app.stellwall.api.TodoRule
import app.stellwall.api.TodosApi
import app.stellwall.api.Visibility
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class TodosApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun api() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `today, a rule and suggestions parse`() = runTest {
        server.enqueue(Contract.response("todos-today"))
        server.enqueue(Contract.response("todo"))
        server.enqueue(Contract.response("todo-suggestions"))
        val today = api().todos("today", mine = true).single()
        val req = server.takeRequest()
        assertEquals("today", req.url.queryParameter("view"))
        assertEquals("1", req.url.queryParameter("mine"))
        assertEquals("Blumen gießen", today.title)
        assertEquals(true, today.needsConfirm)
        assertNull(today.done)
        val rule = api().todo("t1")
        assertEquals(Recurrence("daily"), rule.recurrence)
        assertEquals("08:00", rule.time)
        assertEquals("Müll rausbringen", api().todoSuggestions("Müll").first())
    }

    @Test fun `undated and upcoming parse, done and undone use the date`() = runTest {
        server.enqueue(Contract.response("todos-undated"))
        server.enqueue(Contract.response("todos-upcoming"))
        server.enqueue(Contract.response("todo-done"))
        server.enqueue(Contract.response("todo-undone"))
        assertNull(api().todos("undated", false).single().date)
        assertEquals(true, api().todos("upcoming", false).isNotEmpty())
        server.takeRequest(); server.takeRequest()
        api().done("t1", "2026-11-27")
        assertEquals("""{"date":"2026-11-27"}""", server.takeRequest().body?.utf8())
        api().undone("t1", "2026-11-27")
        assertEquals("/api/todos/t1/done/2026-11-27", server.takeRequest().url.encodedPath)
    }
}

class FakeTodos : TodosApi {
    val calls = mutableListOf<String>()
    val bodies = mutableListOf<TodoBody>()
    var list = listOf(
        Occurrence("t1", "Blumen gießen", "2026-11-27", "2026-11-27T07:00:00.000Z", false, null, listOf("me"), true, true, "sam"),
        Occurrence("t2", "Fahrrad reparieren", null, null, false, null, emptyList(), false, true, "me"),
    )
    override suspend fun members() = listOf(Member("me", "alex", "Alex", "admin", "person-mint", "salbei"))
    override suspend fun todos(view: String, mine: Boolean) = list.also { calls += "todos:$view:$mine" }
    override suspend fun todo(id: String) = TodoRule(id, "Blumen gießen", Visibility(true, emptyList()), "sam", listOf("me"), "2026-11-20", "08:00", Recurrence("daily"), null, true, emptyList())
    override suspend fun createTodo(body: TodoBody) = todo("new").also { calls += "create"; bodies += body }
    override suspend fun updateTodo(id: String, body: TodoBody) = todo(id).also { calls += "update:$id"; bodies += body }
    override suspend fun deleteTodo(id: String) { calls += "delete:$id" }
    override suspend fun done(id: String, date: String) { calls += "done:$id:$date" }
    override suspend fun undone(id: String, date: String) { calls += "undone:$id:$date" }
    override suspend fun todoSuggestions(q: String) = listOf("Müll rausbringen")
}

class TodosModelTest {
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")

    @Test fun `views and mine, ticking uses the date or the undated mark`() = runTest {
        val f = FakeTodos()
        val m = TodosModel(f, me)
        m.load()
        assertEquals("todos:today:true", f.calls.last())
        m.setView(TodoView.Undated)
        m.setMine(false)
        assertEquals("todos:undated:false", f.calls.last())
        m.toggle(f.list[0])
        assertEquals("done:t1:2026-11-27", f.calls.first { it.startsWith("done") })
        m.toggle(f.list[1])
        assertEquals("done:t2:1970-01-01", f.calls.last { it.startsWith("done") })
    }

    @Test fun `a draft becomes the server's body, mistakes are named`() {
        val d = TodoDraft.of(null)
        assertEquals(Visibility(true, emptyList()), d.visibility)
        assertEquals("Wähle mindestens einen Wochentag.", TodoForms.body(d.copy(title = "Müll", repeat = "weekly", startDate = LocalDate.of(2026, 11, 30)), isCreator = true).error)
        assertEquals("Für eine Wiederholung braucht es ein Datum.", TodoForms.body(d.copy(title = "Müll", repeat = "daily"), isCreator = true).error)
        val monthly = TodoForms.body(d.copy(title = " Miete ", repeat = "monthly", startDate = LocalDate.of(2026, 12, 15), time = LocalTime.of(9, 5)), isCreator = true).body!!
        assertEquals("Miete", monthly.title)
        assertEquals(Recurrence("monthly", day = 15), monthly.recurrence)
        assertEquals("09:05", monthly.time)
        val weekly = TodoForms.body(d.copy(title = "Müll", repeat = "weekly", weekdays = setOf(4, 1), startDate = LocalDate.of(2026, 11, 30)), isCreator = false).body!!
        assertEquals(Recurrence("weekly", weekdays = listOf(1, 4)), weekly.recurrence)
        assertNull(weekly.visibility)
        val once = TodoForms.body(d.copy(title = "Fahrrad", until = LocalDate.of(2027, 1, 1)), isCreator = true).body!!
        assertNull(once.until)
        assertNull(once.startDate)
    }

    @Test fun `when an occurrence is, in words`() {
        val zone = ZoneId.of("Europe/Berlin")
        assertEquals("Fr., 27.11., 08:00", TodoText.whenText(Occurrence("t1", "x", "2026-11-27", "2026-11-27T07:00:00.000Z", false, null, emptyList(), false, true, "me"), zone))
        assertEquals("Fr., 27.11.", TodoText.whenText(Occurrence("t1", "x", "2026-11-27", "2026-11-26T23:00:00.000Z", false, null, emptyList(), false, true, "me"), zone))
        assertEquals("", TodoText.whenText(Occurrence("t1", "x", null, null, false, null, emptyList(), false, true, "me"), zone))
    }
}
