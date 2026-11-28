package app.stellwall.api

import java.io.File
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class ShoppingApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun api() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `lists and members parse`() = runTest {
        server.enqueue(Contract.response("lists"))
        server.enqueue(Contract.response("members"))
        val lists = api().lists()
        assertEquals("Einkauf", lists.single().name)
        assertEquals(Visibility(everyone = true, memberIds = emptyList()), lists.single().visibility)
        assertEquals(listOf("Alex", "Sam", "Kim"), api().members().map { it.displayName })
    }

    @Test fun `items keep open and checked apart`() = runTest {
        server.enqueue(Contract.response("items"))
        val items = api().items("l1")
        assertEquals("/api/lists/l1/items", server.takeRequest().url.encodedPath)
        val bread = items.first { it.name == "Brot" }
        val milk = items.first { it.name == "Milch" }
        assertEquals("2026-11-27T10:05:00.000Z", bread.checkedAt)
        assertNull(milk.checkedAt)
        assertEquals("2 l", milk.quantity)
    }

    @Test fun `adding sends only what was given`() = runTest {
        server.enqueue(Contract.response("item-added"))
        server.enqueue(Contract.response("item-added"))
        api().addItem("l1", "Milch", quantity = "2 l", category = null)
        assertEquals("""{"name":"Milch","quantity":"2 l"}""", server.takeRequest().body?.utf8())
        api().addItem("l1", "Milch", quantity = "", category = "Kühlregal")
        assertEquals("""{"name":"Milch","category":"Kühlregal"}""", server.takeRequest().body?.utf8())
    }

    @Test fun `checking sends only the check`() = runTest {
        server.enqueue(Contract.response("item-checked"))
        val item = api().updateItem("i1", ItemChange(checked = true))
        val req = server.takeRequest()
        assertEquals("PATCH", req.method)
        assertEquals("/api/items/i1", req.url.encodedPath)
        assertEquals("""{"checked":true}""", req.body?.utf8())
        assertEquals("2026-11-27T10:05:00.000Z", item.checkedAt)
    }

    @Test fun `suggestions ask with the typed text`() = runTest {
        server.enqueue(Contract.response("suggestions"))
        val s = api().suggestions("mil ch")
        assertEquals("mil ch", server.takeRequest().url.queryParameter("q"))
        assertEquals(Suggestion("Milch", "Kühlregal"), s.first())
    }

    @Test fun `learned suggestions are marked, a guess says whether the name is known`() = runTest {
        server.enqueue(Contract.response("suggestions-learned"))
        val s = api().suggestions("schinken")
        assertEquals(Suggestion("Schinkenwurst", "Sonstiges", learned = true), s.first())
        assertEquals(false, s[1].learned)
        server.takeRequest()
        server.enqueue(Contract.response("catalog-guess"))
        assertEquals(CatalogGuess("Zwiebeln", "Obst & Gemüse", true), api().guess("Zwiebel(n)"))
        assertEquals("Zwiebel(n)", server.takeRequest().url.queryParameter("name"))
        server.enqueue(Contract.response("catalog-guess-unknown"))
        assertEquals(false, api().guess("Kaffeefilter Größe 4").known)
        server.takeRequest()
    }

    @Test fun `learned suggestions are listed, moved and forgotten`() = runTest {
        server.enqueue(Contract.response("catalog-learned"))
        assertEquals(listOf(LearnedEntry("Schinkenwurst", "Sonstiges")), api().learned())
        server.takeRequest()
        server.enqueue(Contract.response("catalog-learned-moved"))
        api().moveLearned("Schinkenwurst", "Fleisch & Fisch")
        val moved = server.takeRequest()
        assertEquals("PATCH", moved.method)
        assertEquals("""{"name":"Schinkenwurst","category":"Fleisch & Fisch"}""", moved.body?.utf8())
        server.enqueue(Contract.response("catalog-learned-forgotten"))
        api().forgetLearned("Schinkenwurst")
        val gone = server.takeRequest()
        assertEquals("DELETE", gone.method)
        assertEquals("Schinkenwurst", gone.url.queryParameter("name"))
    }

    @Test fun `the board reads all three kinds, newest first`() = runTest {
        server.enqueue(Contract.response("board"))
        val rows = api().board()
        assertEquals(3, rows.size)
        val event = rows[0] as BoardRow.Event
        assertEquals("Zahnarzt", event.title)
        assertEquals(false, event.allDay)
        assertEquals("Müll rausbringen", (rows[1] as BoardRow.Todo).title)
        val shop = rows[2] as BoardRow.Shopping
        assertEquals(2, shop.count)
        assertEquals(2, shop.itemIds.size)
        assertEquals(shop.itemIds.map { "item:$it" }, shop.keys)
        assertTrue(event.keys.single().startsWith("event:"))
    }

    @Test fun `a board line is ticked off with its keys`() = runTest {
        server.enqueue(MockResponse.Builder().code(200).body("{\"ok\":true}").build())
        api().boardDismiss(listOf("item:a", "item:b"))
        val req = server.takeRequest()
        assertEquals("/api/board/dismiss", req.url.encodedPath)
        assertEquals("""{"keys":["item:a","item:b"]}""", req.body?.utf8())
    }

    @Test fun `a board kind this app does not know is skipped`() = runTest {
        server.enqueue(
            Contract.response("board").newBuilder()
                .body("""[{"kind":"poll","who":"a","whoName":"Sam","latestAt":"2026-11-27T10:00:00.000Z"}]""")
                .build(),
        )
        assertEquals(emptyList<BoardRow>(), api().board())
    }

    @Test fun `only the creator may change who sees a list`() = runTest {
        server.enqueue(Contract.response("list-not-creator"))
        try {
            api().updateList("l1", visibility = Visibility(false, emptyList()))
            throw AssertionError("expected ApiException")
        } catch (e: ApiException) {
            assertEquals("not_creator", e.code)
        }
    }

    @Test fun `store sections are the server's, in shop order`() {
        val body = (Json.parseToJsonElement(File("../../contract/categories.json").readText()) as JsonObject).getValue("body")
        assertEquals(body.jsonArray.map { it.jsonPrimitive.content }, CATEGORIES)
    }
}
