package app.stellwall.meals

import app.stellwall.api.ApiException
import app.stellwall.api.Ingredient
import app.stellwall.api.LiveEvent
import app.stellwall.api.Meal
import app.stellwall.api.MealBody
import app.stellwall.api.MealsApi
import app.stellwall.api.Member
import app.stellwall.api.RecipeRef
import app.stellwall.api.RecipeSummary
import app.stellwall.api.ShopLine
import app.stellwall.api.ShopPreview
import app.stellwall.api.Staple
import app.stellwall.calendar.Days
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** Amounts as a cook reads them, as in shared/src/meals/ingredients.ts. */
object Amounts {
    private val glyphs = listOf(0.25 to "¼", 1.0 / 3 to "⅓", 0.5 to "½", 2.0 / 3 to "⅔", 0.75 to "¾")

    fun format(q: Double): String {
        if (q >= 100) return q.roundToInt().toString()
        val whole = floor(q).toInt()
        val frac = q - whole
        if (frac < 0.02) return "$whole"
        if (frac > 0.98) return "${whole + 1}"
        glyphs.firstOrNull { abs(it.first - frac) < 0.02 }?.let { return if (whole != 0) "$whole ${it.second}" else it.second }
        val r = (q * 100).roundToInt() / 100.0
        return (if (r == floor(r)) r.toInt().toString() else r.toString()).replace('.', ',')
    }

    /** "100 g" for the given servings factor; nothing when the recipe gives no amount. */
    fun line(i: Ingredient, factor: Double): String = listOfNotNull(i.quantity?.let { format(it * factor) }, i.unit).joinToString(" ")
}

/** The web app's meal wording (web/src/text/de.ts: meals). */
object MealText {
    const val PAGE = "Essensplan"
    const val TITLE = "Was gibt es mittags?"
    const val LUNCH = "Mittag"
    const val NOTHING = "Noch nichts geplant"
    const val THIS_WEEK = "Diese Woche"
    const val PREV = "Woche davor"
    const val NEXT = "Woche danach"
    fun plan(day: String) = "Mittag am $day"
    const val RECIPE = "Rezept"
    const val FREE_TEXT = "Freier Text"
    const val SEARCH = "Rezept suchen"
    const val SEARCH_EMPTY = "Kein Rezept gefunden."
    const val TEXT = "Was gibt es?"
    const val TEXT_HINT = "Zum Beispiel „Pizza bestellen“ oder „Reste“."
    const val COOK = "Wer kocht?"
    const val NOBODY = "Noch offen"
    const val SERVINGS = "Portionen"
    const val FEWER = "Eine Portion weniger"
    const val MORE = "Eine Portion mehr"
    const val SHOW_RECIPE = "Rezept ansehen"
    const val REMOVE = "Aus dem Plan nehmen"
    fun cooks(name: String) = "$name kocht"
    const val SHOP_WEEK = "Zutaten der Woche einkaufen"
    const val SHOP_RECIPE = "Zutaten auf die Einkaufsliste"
    const val SHOP_TITLE = "Zutaten einkaufen"
    const val SPECIAL = "Das wird gebraucht"
    const val PANTRY = "Habt ihr das da?"
    const val PANTRY_HINT = "Grundvorrat, nur anhaken, was fehlt."
    fun putOn(n: Int, list: String) = if (n == 1) "1 Sache auf „$list“ setzen" else "$n Sachen auf „$list“ setzen"
    fun done(n: Int, list: String) = if (n == 1) "1 Sache steht jetzt auf „$list“." else "$n Sachen stehen jetzt auf „$list“."
    const val TO_LIST = "Zur Einkaufsliste"
    const val FINISHED = "Fertig"
    const val NOTHING_TO_BUY = "Für diese Tage sind keine Rezepte mit Zutaten geplant."
    fun missing(names: String) = "Nicht gefunden in Mealie: $names"
    const val INGREDIENTS = "Zutaten"
    const val STEPS = "So geht es"
    const val AWAKE = "Der Bildschirm bleibt an, solange das Rezept offen ist. Erledigtes einfach antippen."
    const val STAPLES = "Grundvorrat"
    const val RECIPES = "Rezepte"
    const val NO_RECIPES = "In Mealie sind noch keine Rezepte."
    const val ADD_RECIPE = "Rezept hinzufügen"
    const val WAY_PHOTO = "Foto"
    const val WAY_LINK = "Link"
    const val WAY_TEXT = "Eintippen"
    const val SCAN = "Rezept fotografieren"
    const val PHOTOS_HINT = "Bis zu vier Seiten, zum Beispiel aus einem Kochbuch. Mealie liest sie mit seiner KI."
    const val LINK = "Link zum Rezept"
    const val RECIPE_TEXT = "Rezept"
    const val RECIPE_TEXT_HINT = "Zutaten und Schritte, so wie sie im Rezept stehen. Mealie macht daraus ein Rezept."
    const val IMPORTING = "Mealie liest das Rezept. Das kann bis zu einer Minute dauern."
    const val IMPORT = "Rezept anlegen"
    const val AS_WRITTEN = "Mengen wie im Rezept"
    const val PLAN_RECIPE = "Einplanen"
    const val PLAN_FOR = "Für welchen Tag?"
    fun planned(day: String) = "Für $day eingeplant."
    fun photos(n: Int) = if (n == 1) "1 Seite fotografiert" else "$n Seiten fotografiert"
    const val STAPLES_LEAD = "Was bei euch meistens da ist. Diese Zutaten fragt Stellwall beim Einkaufen nach, statt sie gleich auf die Liste zu setzen."
    const val STAPLE_ADD = "Zum Grundvorrat"
    const val STAPLE_NAME = "Neue Grundzutat"
    fun stapleRemove(n: String) = "$n entfernen"
    const val STAPLE_EXISTS = "Das steht schon im Grundvorrat."
    fun todayLunch(what: String) = "Heute Mittag: $what"
    const val INVALID = "Bitte die Eingaben prüfen."
    const val GENERIC = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    const val SAVE = "Speichern"
    const val CANCEL = "Abbrechen"
    val ERRORS = mapOf(
        "mealie_not_configured" to "Mealie ist noch nicht verbunden. Die Verwaltung richtet das unter Mehr → Mealie ein. Freier Text geht trotzdem.",
        "mealie_auth" to "Mealie hat den Schlüssel abgelehnt. Die Verwaltung muss ihn unter Mehr → Mealie erneuern.",
        "mealie_unreachable" to "Mealie antwortet gerade nicht. Freier Text geht trotzdem.",
        "mealie_bad" to "Mealie hat eine unerwartete Antwort geschickt.",
        "mealie_import_failed" to "Mealie konnte daraus kein Rezept machen. Ein schärferes Foto oder ein anderer Link hilft oft.",
        "meal_list_hidden" to "Du siehst die Einkaufsliste für den Essensplan nicht. Die Verwaltung kann sie freigeben.",
    )

    fun error(e: Throwable): String = (e as? ApiException)?.let { ERRORS[it.code] } ?: GENERIC
    fun dayName(d: LocalDate): String = java.time.format.DateTimeFormatter.ofPattern("EEEE, d.M.", java.util.Locale.GERMAN).format(d)
}

data class MealsState(
    val week: LocalDate,
    val today: LocalDate = LocalDate.now(),
    val meals: Map<LocalDate, Meal> = emptyMap(),
    val members: List<Member> = emptyList(),
    val error: String? = null,
) {
    val days: List<LocalDate> get() = (0L until 7L).map { week.plusDays(it) }
    val range: String get() = Days.weekTitle(week)
}

/** What the meal sheet holds. */
data class MealDraft(val useText: Boolean, val recipe: RecipeRef?, val text: String, val cookId: String?, val servings: Int)

data class Search(val recipes: List<RecipeSummary>, val error: String?)

class MealsModel(private val api: MealsApi, private val today: () -> LocalDate = { LocalDate.now() }) {
    private val _state = MutableStateFlow(MealsState(Days.weekStart(today()), today()))
    val state: StateFlow<MealsState> = _state

    suspend fun load() {
        val s = _state.value.copy(today = today())
        try {
            val members = s.members.ifEmpty { api.members() }
            val meals = api.meals(s.week.toString()).associateBy { LocalDate.parse(it.date) }
            _state.value = s.copy(meals = meals, members = members, error = null)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.value = s.copy(error = MealText.GENERIC)
        }
    }

    suspend fun step(n: Int) { _state.update { it.copy(week = it.week.plusWeeks(n.toLong())) }; load() }
    suspend fun thisWeek() { _state.update { it.copy(week = Days.weekStart(today())) }; load() }
    suspend fun onLive(e: LiveEvent) { if (e == LiveEvent.Meals || e == LiveEvent.Connected) load() }

    fun draft(meal: Meal?) = MealDraft(useText = meal != null && meal.recipe == null, recipe = meal?.recipe, text = meal?.text.orEmpty(), cookId = meal?.cookId, servings = meal?.servings ?: 4)

    /** A tap on a recipe plans it right away; the recipe's own servings count unless they were set by hand. */
    suspend fun pick(date: LocalDate, d: MealDraft, r: RecipeSummary, planned: Meal?, servingsTouched: Boolean): String? {
        val servings = if (servingsTouched || planned?.recipe?.id == r.id) d.servings else r.servings
        return save(date, d.copy(useText = false, recipe = RecipeRef(r.id, r.slug, r.name), servings = servings))
    }

    /** Error to show, or null when saved. A recipe wins unless free text is chosen. */
    suspend fun save(date: LocalDate, d: MealDraft): String? {
        val useRecipe = !d.useText && d.recipe != null
        if (!useRecipe && d.text.isBlank()) return MealText.INVALID
        val body = if (useRecipe) MealBody(d.recipe, null, d.cookId, d.servings) else MealBody(null, d.text.trim(), d.cookId, d.servings)
        return run { api.saveMeal(date.toString(), body) }
    }

    suspend fun remove(date: LocalDate) = run { api.deleteMeal(date.toString()) }

    suspend fun search(q: String): Search = try {
        Search(api.recipes(q.trim()), null)
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        Search(emptyList(), MealText.error(e))
    }

    private suspend fun run(block: suspend () -> Unit): String? = try {
        block()
        load()
        null
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        MealText.GENERIC
    }
}

data class ShopState(
    val preview: ShopPreview? = null,
    val picked: Set<String> = emptySet(),
    val error: String? = null,
    val done: String? = null,
    val doneListId: String? = null,
    val busy: Boolean = false,
) {
    /** The ticked lines, needed ones first; the same food in two units stays two lines. */
    val lines: List<ShopLine>
        get() = preview?.let { p -> p.special.filter { key("s:", it) in picked } + p.pantry.filter { key("p:", it) in picked } }.orEmpty()

    companion object {
        fun key(prefix: String, l: ShopLine) = "$prefix${l.food}|${l.quantity}"
    }
}

/** Ingredients for chosen days: what is needed ticked, the pantry asked about. */
class ShopModel(private val api: MealsApi) {
    private val _state = MutableStateFlow(ShopState())
    val state: StateFlow<ShopState> = _state

    /** The planned [dates], or one [recipe] from the recipe book (slug to servings). */
    suspend fun load(dates: List<LocalDate>, servings: Int?, recipe: Pair<String, Int>? = null) {
        try {
            val p = if (recipe != null) api.shopRecipe(recipe.first, recipe.second) else api.shopPreview(dates.map { it.toString() }, servings)
            _state.value = ShopState(preview = p, picked = p.special.map { ShopState.key("s:", it) }.toSet())
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.value = ShopState(error = MealText.error(e))
        }
    }

    fun toggle(key: String) = _state.update { it.copy(picked = if (key in it.picked) it.picked - key else it.picked + key) }

    suspend fun commit() {
        val lines = _state.value.lines
        if (lines.isEmpty()) return
        _state.update { it.copy(busy = true, error = null) }
        try {
            val r = api.shopCommit(lines)
            _state.update { it.copy(busy = false, done = MealText.done(r.added, r.listName), doneListId = r.listId) }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(busy = false, error = MealText.error(e)) }
        }
    }
}

class PantryModel(private val api: MealsApi) {
    private val _list = MutableStateFlow<List<Staple>?>(null)
    val list: StateFlow<List<Staple>?> = _list

    suspend fun load() {
        try {
            _list.value = api.pantry()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }

    /** Error to show, or null when added. */
    suspend fun add(name: String): String? {
        if (name.isBlank()) return MealText.INVALID
        return try {
            api.addStaple(name.trim())
            load()
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (e is ApiException && e.code == "exists") MealText.STAPLE_EXISTS else MealText.GENERIC
        }
    }

    suspend fun remove(s: Staple) {
        try {
            api.deleteStaple(s.id)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }
}
