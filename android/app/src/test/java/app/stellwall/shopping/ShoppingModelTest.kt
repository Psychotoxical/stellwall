package app.stellwall.shopping

import app.stellwall.api.BoardRow
import app.stellwall.api.Item
import app.stellwall.api.ItemChange
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.ShoppingApi
import app.stellwall.api.ShoppingList
import app.stellwall.api.Suggestion
import app.stellwall.api.CatalogGuess
import app.stellwall.api.LearnedEntry
import app.stellwall.api.Visibility
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShoppingModelTest {
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val sam = Member("sam", "sam", "Sam", "member", "person-lilac", "flieder")

    private fun item(id: String, name: String, category: String, by: String = "me", checked: Boolean = false) =
        Item(id, "l1", name, "", category, by, "2026-11-27T10:00:00.000Z", if (checked) "2026-11-27T11:00:00.000Z" else null, if (checked) "me" else null)

    private class Fake : ShoppingApi {
        var lists = listOf(ShoppingList("l1", "Einkauf", Visibility(true, emptyList()), "me", 2), ShoppingList("l2", "Drogerie", Visibility(false, listOf("me")), "me", 0))
        var items = mutableMapOf<String, List<Item>>()
        var board = emptyList<BoardRow>()
        var failUpdate = false
        var seen = 0
        val calls = mutableListOf<String>()
        override suspend fun lists() = lists.also { calls += "lists" }
        override suspend fun items(listId: String) = items[listId].orEmpty().also { calls += "items:$listId" }
        override suspend fun members() = emptyList<Member>()
        override suspend fun board() = board
        override suspend fun boardSeen() { seen++ }
        override suspend fun addItem(listId: String, name: String, quantity: String, category: String?): Item {
            calls += "add:$name:$quantity:$category"
            return Item("new", listId, name, quantity, category ?: "Sonstiges", "me", "2026-11-27T12:00:00.000Z", null, null)
        }
        override suspend fun updateItem(id: String, change: ItemChange): Item {
            calls += "update:$id:${change.checked}"
            if (failUpdate) throw IOException("down")
            val list = items.getValue("l1")
            val i = list.first { it.id == id }
            val updated = i.copy(checkedAt = if (change.checked == true) "2026-11-27T12:00:00.000Z" else null, checkedBy = if (change.checked == true) "me" else null)
            items["l1"] = list.map { if (it.id == id) updated else it }
            return updated
        }
        override suspend fun deleteItem(id: String) { calls += "delete:$id" }
        override suspend fun createList(name: String, visibility: Visibility) = ShoppingList("l3", name, visibility, "me", 0).also { lists = lists + it }
        override suspend fun updateList(id: String, name: String?, visibility: Visibility?) = lists.first { it.id == id }
        override suspend fun deleteList(id: String) { calls += "deleteList:$id" }
        override suspend fun clearList(id: String) { calls += "clearList:$id"; items[id] = emptyList() }
        override suspend fun suggestions(q: String) = listOf(Suggestion("Milch", "Kühlregal"))
    }

    private fun fake() = Fake().apply {
        items["l1"] = listOf(
            item("a", "Shampoo", "Drogerie"),
            item("b", "Äpfel", "Obst & Gemüse", by = "sam"),
            item("c", "Brot", "Backwaren", checked = true),
            item("d", "Bananen", "Obst & Gemüse"),
        )
    }

    @Test fun `a list is emptied at once and stays`() = runTest {
        val f = fake()
        val m = ShoppingModel(f, me)
        m.load()
        assertEquals(true, m.clearList())
        assertTrue("clearList:l1" in f.calls)
        assertEquals("l1", m.state.value.list?.id)
        assertEquals(emptyList<Any>(), m.state.value.groups)
        assertEquals(emptyList<Any>(), m.state.value.checked)
    }

    @Test fun `open items are grouped in shop order, checked ones apart`() = runTest {
        val m = ShoppingModel(fake(), me)
        m.load()
        val s = m.state.value
        assertEquals("l1", s.list?.id)
        assertEquals(listOf("Obst & Gemüse", "Drogerie"), s.groups.map { it.category })
        assertEquals(listOf("Äpfel", "Bananen"), s.groups[0].items.map { it.name })
        assertEquals(listOf("Brot"), s.checked.map { it.name })
    }

    @Test fun `a chosen list opens`() = runTest {
        val m = ShoppingModel(fake(), me)
        m.load("l2")
        assertEquals("Drogerie", m.state.value.list?.name)
    }

    @Test fun `checking shows at once and stays after the answer`() = runTest {
        val f = fake()
        val m = ShoppingModel(f, me)
        m.load()
        m.toggle(m.state.value.groups[0].items[0])
        assertEquals(setOf("Äpfel", "Brot"), m.state.value.checked.map { it.name }.toSet())
        assertTrue("update:b:true" in f.calls)
        assertNull(m.state.value.error)
    }

    @Test fun `a failed check goes back and says so`() = runTest {
        val f = fake().apply { failUpdate = true }
        val m = ShoppingModel(f, me)
        m.load()
        m.toggle(m.state.value.groups[0].items[0])
        assertEquals(listOf("Brot"), m.state.value.checked.map { it.name })
        assertEquals("Das hat nicht geklappt. Bitte noch einmal versuchen.", m.state.value.error)
    }

    @Test fun `what others added stays marked while the page is open, and leaving does not mark it seen`() = runTest {
        val f = fake().apply { board = listOf(BoardRow.Shopping("sam", "Sam", "l1", "Einkauf", 1, "2026-11-27T10:00:00.000Z", listOf("b"))) }
        val m = ShoppingModel(f, me)
        m.load()
        assertEquals(setOf("b"), m.state.value.unseen)
        f.board = emptyList()
        m.onLive(LiveEvent.List("l1"))
        assertEquals(setOf("b"), m.state.value.unseen)
        m.leave()
        // Seen is ticked off on the start page now, not by looking at the list.
        assertEquals(0, f.seen)
    }

    @Test fun `a hint for the open list reloads it, others only the counts`() = runTest {
        val f = fake()
        val m = ShoppingModel(f, me)
        m.load()
        f.calls.clear()
        m.onLive(LiveEvent.List("l2"))
        assertEquals(listOf("lists"), f.calls)
        f.calls.clear()
        m.onLive(LiveEvent.List("l1"))
        assertEquals(listOf("lists", "items:l1"), f.calls)
    }

    @Test fun `a pick needs a name, a suggestion brings its section, the amount comes from the sheet`() = runTest {
        val f = fake()
        val m = ShoppingModel(f, me)
        m.load()
        assertEquals(null, m.pick("  ", null, emptyList()))
        val pick = m.pick("mil", Suggestion("Milch", "Kühlregal"), emptyList())
        assertEquals(Pick("Milch", "Kühlregal", true), pick)
        assertEquals(true, m.add(pick!!, " 2 ", "Kühlregal"))
        assertTrue("add:Milch:2:Kühlregal" in f.calls)
    }

    @Test fun `a typed name that is shown as a suggestion is known, any other is asked about`() = runTest {
        val asked = mutableListOf<String>()
        val f = object : ShoppingApi by fake() {
            override suspend fun guess(name: String): CatalogGuess { asked += name; return CatalogGuess("Zwiebeln", "Obst & Gemüse", true) }
        }
        val m = ShoppingModel(f, me)
        assertEquals(Pick("Milch", "Kühlregal", true), m.pick("milch", null, listOf(Suggestion("Milch", "Kühlregal"))))
        assertEquals(emptyList<String>(), asked)
        assertEquals(Pick("Zwiebeln", "Obst & Gemüse", true), m.pick(" Zwiebel(n) ", null, emptyList()))
        assertEquals(listOf("Zwiebel(n)"), asked)
    }

    @Test fun `without the server a new name still gets the sheet, in Sonstiges`() = runTest {
        val f = object : ShoppingApi by fake() {
            override suspend fun guess(name: String): CatalogGuess = throw IOException("down")
        }
        assertEquals(Pick("Schinkenwurst", "Sonstiges", false), ShoppingModel(f, me).pick("Schinkenwurst", null, emptyList()))
    }

    @Test fun `learned suggestions are forgotten and moved through the server`() = runTest {
        val done = mutableListOf<String>()
        val f = object : ShoppingApi by fake() {
            override suspend fun forgetLearned(name: String) { done += "forget:$name" }
            override suspend fun moveLearned(name: String, category: String) { done += "move:$name:$category" }
            override suspend fun learned() = listOf(LearnedEntry("Schinkenwurst", "Sonstiges"))
        }
        val m = ShoppingModel(f, me)
        assertEquals(listOf(LearnedEntry("Schinkenwurst", "Sonstiges")), m.learned())
        assertTrue(m.forget(Suggestion("Schinkenwrust", "Sonstiges", learned = true)))
        assertTrue(m.moveLearned("Schinkenwurst", "Fleisch & Fisch"))
        assertEquals(listOf("forget:Schinkenwrust", "move:Schinkenwurst:Fleisch & Fisch"), done)
    }

    @Test fun `who sees a list, in words`() {
        val members = listOf(me, sam)
        assertEquals("Alle", visibilityLabel(Visibility(true, emptyList()), members, "me"))
        assertEquals("Nur ich", visibilityLabel(Visibility(false, listOf("me")), members, "me"))
        assertEquals("Alex, Sam", visibilityLabel(Visibility(false, listOf("me", "sam")), members, "me"))
    }

    @Test fun `a cancelled search stays cancelled`() = runTest {
        val f = object : ShoppingApi by fake() {
            override suspend fun suggestions(q: String): List<Suggestion> = throw kotlinx.coroutines.CancellationException("left the page")
        }
        try {
            ShoppingModel(f, me).suggestions("mil")
            throw AssertionError("expected CancellationException")
        } catch (_: kotlinx.coroutines.CancellationException) {
        }
    }
}
