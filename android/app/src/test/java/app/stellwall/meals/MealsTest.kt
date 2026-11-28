package app.stellwall.meals

import app.stellwall.api.ApiException
import app.stellwall.api.CommitResult
import app.stellwall.api.Ingredient
import app.stellwall.api.Meal
import app.stellwall.api.MealBody
import app.stellwall.api.MealsApi
import app.stellwall.api.Member
import app.stellwall.api.Recipe
import app.stellwall.api.RecipeRef
import app.stellwall.api.RecipeSummary
import app.stellwall.api.ShopLine
import app.stellwall.api.ShopPreview
import app.stellwall.api.Staple
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AmountsTest {
    @Test fun `amounts read like a cook writes them, as in shared`() {
        assertEquals("1 ½", Amounts.format(1.5))
        assertEquals("¼", Amounts.format(0.25))
        assertEquals("¾", Amounts.format(0.75))
        assertEquals("⅓", Amounts.format(1.0 / 3))
        assertEquals("2", Amounts.format(2.0))
        assertEquals("1,2", Amounts.format(1.2))
        assertEquals("333", Amounts.format(333.333))
    }

    @Test fun `scaled for other servings, unit after the amount`() {
        val rice = Ingredient(200.0, "g", "Reis", "")
        assertEquals("100 g", Amounts.line(rice, 2.0 / 4))
        assertEquals("", Amounts.line(Ingredient(null, null, "Salz", ""), 1.5))
        assertEquals("EL", Amounts.line(Ingredient(null, "EL", "Öl", ""), 1.0))
    }
}

class FakeMeals : MealsApi {
    val calls = mutableListOf<String>()
    var meals = mutableListOf(
        Meal("2026-11-30", RecipeRef("r1", "gemuese-pfanne", "Gemüsepfanne"), null, "sam", 2, "me"),
        Meal("2026-12-02", null, "Reste", null, 4, "me"),
    )
    var searchFails: ApiException? = null
    override suspend fun members() = listOf(Member("me", "alex", "Alex", "admin", "person-mint", "salbei"), Member("sam", "sam", "Sam", "member", "person-lilac", "flieder"))
    override suspend fun meals(week: String) = meals.toList().also { calls += "meals:$week" }
    override suspend fun saveMeal(date: String, body: MealBody) = Meal(date, body.recipe, body.text, body.cookId, body.servings, "me").also { calls += "save:$date:${body.recipe?.slug}:${body.text}:${body.servings}" }
    override suspend fun deleteMeal(date: String) { calls += "delete:$date" }
    override suspend fun recipes(q: String): List<RecipeSummary> { searchFails?.let { throw it }; return listOf(RecipeSummary("r2", "pfannkuchen", "Pfannkuchen", 2, false)) }
    override suspend fun recipe(slug: String) = Recipe("r1", slug, "Gemüsepfanne", 4, true, listOf(Ingredient(200.0, "g", "Reis", ""), Ingredient(null, null, "Salz", "")), listOf("Reis kochen.", "Würzen."), servingsKnown = !bakingSheet)
    override suspend fun recipeImage(id: String) = ByteArray(0)
    override suspend fun shopPreview(dates: List<String>, servings: Int?) = ShopPreview("l1", "Wocheneinkauf", listOf(ShopLine("Paprika", "1×", "1")), listOf(ShopLine("Reis", "100 g", "100 g")), emptyList()).also { calls += "preview:$dates:$servings" }
    override suspend fun shopCommit(lines: List<ShopLine>) = CommitResult(lines.size, "l1", "Wocheneinkauf").also { calls += "commit:${lines.map { it.food }}" }
    override suspend fun pantry() = listOf(Staple("s1", "Salz", emptyList()))
    override suspend fun addStaple(name: String) = Staple("s2", name, emptyList())
    override suspend fun deleteStaple(id: String) { calls += "deleteStaple:$id" }
    var bakingSheet = false
    override suspend fun shopRecipe(slug: String, servings: Int) = ShopPreview("l1", "Wocheneinkauf", emptyList(), listOf(ShopLine("Reis", "200 g", "200 g")), emptyList()).also { calls += "shopRecipe:$slug:$servings" }
    override suspend fun importRecipe(url: String?, text: String?, images: List<app.stellwall.api.ImportImage>?) =
        RecipeSummary("r9", "neu", "Aus dem Netz", 4, false).also { calls += "import:$url:$text:${images?.size}" }
}

class MealsModelTest {
    private val today = LocalDate.of(2026, 12, 2)

    @Test fun `the week starts on Monday and steps by seven days`() = runTest {
        val f = FakeMeals()
        val m = MealsModel(f, today = { today })
        m.load()
        assertEquals("meals:2026-11-30", f.calls.last())
        assertEquals("Gemüsepfanne", m.state.value.meals[LocalDate.of(2026, 11, 30)]?.recipe?.name)
        m.step(1)
        assertEquals("meals:2026-12-07", f.calls.last())
        m.thisWeek()
        assertEquals("meals:2026-11-30", f.calls.last())
    }

    @Test fun `a meal is a recipe or a text, never neither`() = runTest {
        val f = FakeMeals()
        val m = MealsModel(f, today = { today })
        assertEquals("Bitte die Eingaben prüfen.", m.save(LocalDate.of(2026, 12, 3), MealDraft(useText = true, recipe = null, text = " ", cookId = null, servings = 4)))
        assertNull(m.save(LocalDate.of(2026, 12, 3), MealDraft(useText = true, recipe = RecipeRef("r1", "gemuese-pfanne", "Gemüsepfanne"), text = " Pizza ", cookId = null, servings = 4)))
        assertEquals("save:2026-12-03:null:Pizza:4", f.calls.last { it.startsWith("save") })
        assertNull(m.save(LocalDate.of(2026, 12, 4), MealDraft(useText = false, recipe = RecipeRef("r2", "pfannkuchen", "Pfannkuchen"), text = "ignored", cookId = "sam", servings = 2)))
        assertEquals("save:2026-12-04:pfannkuchen:null:2", f.calls.last { it.startsWith("save") })
    }

    @Test fun `a tap on a recipe plans it at once, with the servings set before`() = runTest {
        val f = FakeMeals()
        val m = MealsModel(f, today = { today })
        val veg = RecipeSummary("r1", "gemuese-pfanne", "Gemüsepfanne", servings = 2, hasImage = false)
        val fresh = m.draft(null)
        assertNull(m.pick(LocalDate.of(2026, 12, 3), fresh, veg, planned = null, servingsTouched = false))
        assertEquals("save:2026-12-03:gemuese-pfanne:null:2", f.calls.last { it.startsWith("save") })
        assertNull(m.pick(LocalDate.of(2026, 12, 4), fresh.copy(servings = 5), veg, planned = null, servingsTouched = true))
        assertEquals("save:2026-12-04:gemuese-pfanne:null:5", f.calls.last { it.startsWith("save") })
    }

    @Test fun `Mealie errors read like the web app`() = runTest {
        val f = FakeMeals().apply { searchFails = ApiException(409, "mealie_not_configured") }
        val m = MealsModel(f, today = { today })
        val r = m.search("pf")
        assertTrue(r.recipes.isEmpty())
        assertEquals("Mealie ist noch nicht verbunden. Die Verwaltung richtet das unter Mehr → Mealie ein. Freier Text geht trotzdem.", r.error)
    }

    @Test fun `shopping ticks what is needed, asks about the pantry, puts the ticked on the list`() = runTest {
        val f = FakeMeals()
        val shop = ShopModel(f)
        shop.load(listOf(LocalDate.of(2026, 11, 30), LocalDate.of(2026, 12, 2)), servings = null)
        assertEquals("preview:[2026-11-30, 2026-12-02]:null", f.calls.last())
        assertEquals(setOf("s:Paprika|1×"), shop.state.value.picked)
        shop.toggle("p:Reis|100 g")
        assertEquals(2, shop.state.value.lines.size)
        shop.commit()
        assertEquals("commit:[Paprika, Reis]", f.calls.last())
        assertEquals("2 Sachen stehen jetzt auf „Wocheneinkauf“.", shop.state.value.done)
    }
}

class CookMarksTest {
    private class MemStore : MarkStore {
        val map = mutableMapOf<String, String>()
        override fun all() = map.toMap()
        override fun put(key: String, value: String) { map[key] = value }
        override fun remove(key: String) { map.remove(key) }
    }

    @Test fun `marks stay per recipe and day, and are gone after a week`() {
        val store = MemStore()
        var now = 1_000_000_000_000L
        val a = CookMarks(store, "pfannkuchen", "2026-12-02") { now }
        a.flip(Part.Ingredient, 0)
        a.flip(Part.Step, 1)
        assertEquals(setOf(0), CookMarks(store, "pfannkuchen", "2026-12-02") { now }.ingredients)
        assertEquals(setOf(1), CookMarks(store, "pfannkuchen", "2026-12-02") { now }.steps)
        assertTrue(CookMarks(store, "pfannkuchen", "2026-12-03") { now }.ingredients.isEmpty())
        now += 8L * 86_400_000
        assertTrue(CookMarks(store, "pfannkuchen", "2026-12-02") { now }.ingredients.isEmpty())
        assertFalse(store.map.keys.any { it.endsWith("2026-12-02") })
    }
}

class StepTextTest {
    @Test fun `a step shows bold without the stars, as in shared`() {
        val s = stepText("Mit **250 g Butter** und *kalter* Milch")
        assertEquals("Mit 250 g Butter und kalter Milch", s.text)
        val bold = s.spanStyles.filter { it.item.fontWeight == androidx.compose.ui.text.font.FontWeight.Bold }.map { s.text.substring(it.start, it.end) }
        assertEquals(listOf("250 g Butter"), bold)
        val italic = s.spanStyles.filter { it.item.fontStyle == androidx.compose.ui.text.font.FontStyle.Italic }.map { s.text.substring(it.start, it.end) }
        assertEquals(listOf("kalter"), italic)
        assertEquals("2 * 3 Teile, **offen", stepText("2 * 3 Teile, **offen").text)
    }
}

class CategoryFilterTest {
    private val haupt = app.stellwall.api.RecipeCategory("c1", "hauptgericht", "Hauptgericht")
    private val backen = app.stellwall.api.RecipeCategory("c2", "backen", "Backen")
    private val book = listOf(
        RecipeSummary("r1", "pfanne", "Pfanne", 4, false, categories = listOf(haupt)),
        RecipeSummary("r2", "kuchen", "Kuchen", 4, false, categories = listOf(backen, haupt)),
        RecipeSummary("r3", "brot", "Brot", 4, false),
    )

    @Test fun `chips are the categories with recipes, fullest first, as on the web`() {
        assertEquals(listOf("Hauptgericht", "Backen"), CategoryFilter.chips(book).map { it.name })
    }

    @Test fun `chips narrow together, and without category stands alone`() {
        var picked = CategoryFilter.flip(emptyList(), "backen")
        picked = CategoryFilter.flip(picked, "hauptgericht")
        assertEquals(listOf("kuchen"), CategoryFilter.shown(book, picked).map { it.slug })
        picked = CategoryFilter.flip(picked, CategoryFilter.WITHOUT)
        assertEquals(listOf(CategoryFilter.WITHOUT), picked)
        assertEquals(listOf("brot"), CategoryFilter.shown(book, picked).map { it.slug })
        assertEquals(3, CategoryFilter.shown(book, emptyList()).size)
    }
}
