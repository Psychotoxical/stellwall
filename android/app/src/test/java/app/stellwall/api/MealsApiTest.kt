package app.stellwall.api

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MealsApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun api() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `a recipe, the week and the shopping preview parse`() = runTest {
        server.enqueue(Contract.response("recipe"))
        server.enqueue(Contract.response("meals"))
        server.enqueue(Contract.response("meals-shop-preview"))
        val r = api().recipe("gemuese-pfanne")
        assertEquals(4, r.servings)
        assertEquals(Ingredient(1.5, "EL", "Öl", ""), r.ingredients[1])
        assertNull(r.ingredients.last().quantity)
        assertEquals(2, r.steps.size)
        val week = api().meals("2026-11-30")
        assertEquals("Gemüsepfanne", week[0].recipe?.name)
        assertEquals("Reste", week[1].text)
        val p = api().shopPreview(listOf("2026-11-30"), null)
        assertEquals("Wocheneinkauf", p.listName)
        assertEquals("¾ EL", p.pantry.first { it.food == "Öl" }.display)
    }

    @Test fun `a free-text meal sends the recipe as null, the server wants both`() = runTest {
        server.enqueue(Contract.response("meal-saved"))
        api().saveMeal("2026-12-02", MealBody(null, "Reste", null, 4))
        val req = server.takeRequest()
        assertEquals("PUT", req.method)
        assertEquals("""{"recipe":null,"text":"Reste","cookId":null,"servings":4}""", req.body?.utf8())
    }

    @Test fun `the recipe book shops for one recipe and adds new ones to Mealie`() = runTest {
        server.enqueue(Contract.response("recipe-shop-preview"))
        val p = api().shopRecipe("pfannkuchen", 4)
        assertEquals("""{"recipe":{"slug":"pfannkuchen","servings":4}}""", server.takeRequest().body?.utf8())
        assertTrue(p.pantry.isNotEmpty())
        server.enqueue(Contract.response("recipe-imported"))
        val made = api().importRecipe(text = "Pfannkuchen: 250 g Mehl, 3 Eier.")
        assertEquals("""{"text":"Pfannkuchen: 250 g Mehl, 3 Eier."}""", server.takeRequest().body?.utf8())
        assertEquals("neu-0", made.slug)
        assertEquals(false, made.servingsKnown)
        server.enqueue(Contract.response("recipe-import-failed"))
        val e = runCatching { api().importRecipe(url = "https://example.com/kaputt") }.exceptionOrNull() as ApiException
        assertEquals("mealie_import_failed", e.code)
        assertTrue(app.stellwall.meals.MealText.error(e).startsWith("Mealie konnte daraus kein Rezept machen"))
    }

    @Test fun `without Mealie the search says so`() = runTest {
        server.enqueue(Contract.response("recipes-not-configured"))
        try {
            api().recipes("")
            throw AssertionError("expected ApiException")
        } catch (e: ApiException) {
            assertEquals("mealie_not_configured", e.code)
        }
    }

    @Test fun `a new to-do sends empty date and time as null, without visibility for non-creators`() = runTest {
        server.enqueue(Contract.response("todo-created"))
        api().createTodo(TodoBody("Müll", emptyList(), null, null, Recurrence("none"), null, false, emptyList(), visibility = null))
        assertEquals(
            """{"title":"Müll","assignees":[],"startDate":null,"time":null,"recurrence":{"kind":"none"},"until":null,"needsConfirm":false,"reminders":[]}""",
            server.takeRequest().body?.utf8(),
        )
    }
}
