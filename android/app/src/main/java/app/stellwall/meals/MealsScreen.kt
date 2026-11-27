package app.stellwall.meals

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.LiveEvent
import app.stellwall.api.Meal
import app.stellwall.api.MealsApi
import app.stellwall.api.Recipe
import app.stellwall.api.RecipeRef
import app.stellwall.api.RecipeSummary
import app.stellwall.calendar.Days
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.BackLink
import app.stellwall.ui.BoxCard
import app.stellwall.ui.Dropdown
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.RowDivider
import app.stellwall.ui.SectionHead
import app.stellwall.ui.Sheet
import app.stellwall.ui.Stepper
import app.stellwall.ui.fieldColors
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch

/** Where the meal area is: the week, a recipe (with the day it is planned for), or the pantry. */
sealed interface MealPage {
    data object Week : MealPage
    data class Cook(val slug: String, val servings: Int?, val date: LocalDate?) : MealPage
    data object Pantry : MealPage
}

@Composable
fun MealsArea(model: MealsModel, api: MealsApi, live: Flow<LiveEvent> = emptyFlow(), start: MealPage = MealPage.Week, onOpenList: (String) -> Unit = {}) {
    var page by remember(start) { mutableStateOf(start) }
    if (page != MealPage.Week) BackHandler { page = MealPage.Week }
    when (val pg = page) {
        MealPage.Week -> MealsScreen(model, api, live, onCook = { page = it }, onPantry = { page = MealPage.Pantry }, onOpenList = onOpenList)
        is MealPage.Cook -> RecipeScreen(api, pg, onBack = { page = MealPage.Week }, onOpenList = onOpenList)
        MealPage.Pantry -> PantryScreen(remember(api) { PantryModel(api) }, onBack = { page = MealPage.Week })
    }
}

@Composable
fun MealsScreen(model: MealsModel, api: MealsApi, live: Flow<LiveEvent>, onCook: (MealPage.Cook) -> Unit, onPantry: () -> Unit, onOpenList: (String) -> Unit) {
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var edit by remember { mutableStateOf<LocalDate?>(null) }
    var shop by remember { mutableStateOf<List<LocalDate>?>(null) }
    LaunchedEffect(model) { model.load() }
    LaunchedEffect(model, live) { live.collect { model.onLive(it) } }
    val p = LocalPalette.current
    val today = s.today

    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        PageHead(title = MealText.TITLE, sub = MealText.PAGE)
        // The week on its own line, the arrows below: also fits a small phone with large text.
        Text(s.range, style = MaterialTheme.typography.titleMedium, color = p.ink, modifier = Modifier.padding(bottom = 4.dp))
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            NavButton("‹", MealText.PREV) { scope.launch { model.step(-1) } }
            Box(
                Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(p.field).clickable(role = Role.Button) { scope.launch { model.thisWeek() } }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text(MealText.THIS_WEEK, style = MaterialTheme.typography.labelLarge, color = p.ink) }
            NavButton("›", MealText.NEXT) { scope.launch { model.step(1) } }
        }
        s.error?.let { Notice(it, Modifier.padding(bottom = 10.dp)) }
        BoxCard {
            s.days.forEachIndexed { n, d ->
                if (n > 0) RowDivider()
                val m = s.meals[d]
                val cook = m?.cookId?.let { id -> s.members.firstOrNull { it.id == id } }
                Row(Modifier.fillMaxWidth().background(if (d == today) p.field else p.surface), verticalAlignment = Alignment.CenterVertically) {
                    Row(
                        Modifier.weight(1f).heightIn(min = 64.dp).clickable(role = Role.Button) { edit = d }
                            .semantics { contentDescription = "${MealText.dayName(d)}, ${MealText.LUNCH}: ${m?.let { it.recipe?.name ?: it.text } ?: MealText.NOTHING}" }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.width(40.dp)) {
                            Text(Days.weekdayShort(d), style = MaterialTheme.typography.labelMedium, color = if (d == today) p.primary else p.inkSoft)
                            Text("${d.dayOfMonth}.", style = MaterialTheme.typography.titleMedium, color = if (d == today) p.primary else p.ink)
                        }
                        if (m?.recipe != null) RecipeImage(api, m.recipe.id, Modifier.size(48.dp).clip(RoundedCornerShape(10.dp)))
                        Column(Modifier.weight(1f)) {
                            Text(m?.let { it.recipe?.name ?: it.text } ?: MealText.NOTHING, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = if (m == null) p.inkSoft else p.ink)
                            if (cook != null) Text(MealText.cooks(cook.displayName), style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                        }
                    }
                    if (m?.recipe != null) {
                        Box(
                            Modifier.size(56.dp).clickable(role = Role.Button) { onCook(MealPage.Cook(m.recipe.slug, m.servings, d)) }
                                .semantics { contentDescription = "${MealText.SHOW_RECIPE}: ${m.recipe.name}" },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.vector(Icons.RECIPE), contentDescription = null, tint = p.ink, modifier = Modifier.size(24.dp)) }
                    }
                }
            }
        }
        PrimaryButton(MealText.SHOP_WEEK, { shop = s.days }, Modifier.fillMaxWidth().padding(top = 14.dp))
        GhostButton(MealText.STAPLES, onPantry, Modifier.fillMaxWidth().padding(top = 8.dp))
    }

    edit?.let { d ->
        MealSheet(model, d, s.meals[d], s.members, api, onClose = { edit = null })
    }
    shop?.let { dates -> ShopSheet(api, dates, null, onClose = { shop = null }, onOpenList = { shop = null; onOpenList(it) }) }
}

@Composable
private fun NavButton(text: String, label: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp), color = LocalPalette.current.ink)
    }
}

/** A recipe picture through the signed-in connection; nothing shows when there is none. */
@Composable
fun RecipeImage(api: MealsApi, id: String, modifier: Modifier) {
    val img by produceState<ImageBitmap?>(ImageCache.get(id), id) {
        if (value == null) value = app.stellwall.api.quietly {
            val bytes = api.recipeImage(id)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { ImageCache.put(id, it) }
        }
    }
    img?.let { Image(it, contentDescription = null, modifier = modifier, contentScale = ContentScale.Crop) }
}

private object ImageCache {
    private val cache = LruCache<String, ImageBitmap>(40)
    fun get(id: String): ImageBitmap? = cache.get(id)
    fun put(id: String, b: ImageBitmap) { cache.put(id, b) }
}

@Composable
private fun MealSheet(model: MealsModel, date: LocalDate, meal: Meal?, members: List<app.stellwall.api.Member>, api: MealsApi, onClose: () -> Unit) {
    val p = LocalPalette.current
    val scope = rememberCoroutineScope()
    var d by remember(meal) { mutableStateOf(model.draft(meal)) }
    var q by remember { mutableStateOf("") }
    var search by remember { mutableStateOf<Search?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var servingsTouched by remember { mutableStateOf(false) }
    LaunchedEffect(q) {
        delay(200)
        search = model.search(q)
    }
    val mealieDown = search?.error
    // With Mealie away a planned recipe stays as it is; only days without one switch to free text.
    val showText = d.useText || (mealieDown != null && d.recipe == null)
    val keepRecipe = mealieDown != null && d.recipe != null && !d.useText

    Sheet(MealText.plan(MealText.dayName(date)), onClose) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((text, on) in listOf(MealText.RECIPE to !showText, MealText.FREE_TEXT to showText)) {
                Box(
                    Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(if (on) p.surface else p.field)
                        .border(1.dp, if (on) p.primary else p.field, RoundedCornerShape(50))
                        .selectable(selected = on, role = Role.Tab) { d = d.copy(useText = text == MealText.FREE_TEXT) }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(text, style = MaterialTheme.typography.labelLarge, color = p.ink) }
            }
        }
        // Who cooks and how many first: the recipe list below can be long.
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
            val names = listOf(MealText.NOBODY) + members.map { it.displayName }
            Dropdown(MealText.COOK, members.firstOrNull { it.id == d.cookId }?.displayName ?: MealText.NOBODY, names, Modifier.weight(1f)) { i ->
                d = d.copy(cookId = if (i == 0) null else members[i - 1].id)
            }
            Stepper(MealText.SERVINGS, d.servings, 1, 50, MealText.FEWER, MealText.MORE) { d = d.copy(servings = it); servingsTouched = true }
        }
        mealieDown?.let { Notice(it) }
        if (keepRecipe) Text(d.recipe!!.name, style = MaterialTheme.typography.titleMedium, color = p.ink)
        if (!showText && !keepRecipe) {
            OutlinedTextField(
                q, { q = it.take(100) }, Modifier.fillMaxWidth(), label = { Text(MealText.SEARCH) }, singleLine = true, colors = fieldColors(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            )
            val list = search?.recipes.orEmpty()
            if (search != null && list.isEmpty() && mealieDown == null) Text(MealText.SEARCH_EMPTY, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge)
            // A tap plans the recipe at once: the list can be long and Save sits below it.
            for (r in list) RecipeRow(api, r, on = d.recipe?.id == r.id) {
                d = d.copy(recipe = RecipeRef(r.id, r.slug, r.name))
                scope.launch { error = model.pick(date, d, r, meal, servingsTouched); if (error == null) onClose() }
            }
        }
        if (showText) {
            OutlinedTextField(
                d.text, { d = d.copy(text = it.take(120)) }, Modifier.fillMaxWidth(), label = { Text(MealText.TEXT) }, singleLine = true, colors = fieldColors(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences), supportingText = { Text(MealText.TEXT_HINT, color = p.inkSoft) },
            )
        }
        error?.let { Notice(it) }
        PrimaryButton(MealText.SAVE, { scope.launch { error = model.save(date, d.copy(useText = showText)); if (error == null) onClose() } }, Modifier.fillMaxWidth())
        GhostButton(MealText.CANCEL, onClose, Modifier.fillMaxWidth())
        if (meal != null) GhostButton(MealText.REMOVE, { scope.launch { error = model.remove(date); if (error == null) onClose() } }, Modifier.fillMaxWidth(), danger = true)
    }
}

@Composable
private fun RecipeRow(api: MealsApi, r: RecipeSummary, on: Boolean, onPick: () -> Unit) {
    val p = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clip(RadiusSm).background(if (on) p.field else p.surface).border(1.5.dp, if (on) p.primary else p.rule, RadiusSm)
            .selectable(selected = on, role = Role.RadioButton, onClick = onPick).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(p.field), contentAlignment = Alignment.Center) {
            if (r.hasImage) RecipeImage(api, r.id, Modifier.size(52.dp)) else Icon(Icons.vector(Icons.MEALS), contentDescription = null, tint = p.inkSoft, modifier = Modifier.size(24.dp))
        }
        Text(r.name, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink)
    }
}

/** A recipe while cooking: the screen stays on, ingredients and steps can be ticked off. */
@Composable
fun RecipeScreen(api: MealsApi, page: MealPage.Cook, onBack: () -> Unit, onOpenList: (String) -> Unit) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val view = LocalView.current
    DisposableEffect(view) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }
    var recipe by remember { mutableStateOf<Recipe?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(page.slug) {
        try {
            recipe = api.recipe(page.slug)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = MealText.error(e)
        }
    }
    val day = (page.date ?: LocalDate.now()).toString()
    val marks = remember(page.slug, day) { CookMarks(PrefsMarkStore(context), page.slug, day) }
    var ticks by remember(marks) { mutableStateOf(marks.ingredients to marks.steps) }
    var servings by rememberSaveable { mutableStateOf(page.servings) }
    var shop by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        BackLink(MealText.PAGE, onBack)
        val r = recipe
        if (r == null) {
            PageHead(MealText.SHOW_RECIPE, MealText.PAGE)
            error?.let { Notice(it) }
            return@Column
        }
        PageHead(r.name, MealText.PAGE)
        if (r.hasImage) RecipeImage(api, r.id, Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(16.dp)))
        val n = servings ?: r.servings
        Box(Modifier.padding(top = 12.dp)) { Stepper(MealText.SERVINGS, n, 1, 50, MealText.FEWER, MealText.MORE) { servings = it } }
        SectionHead(MealText.INGREDIENTS)
        BoxCard {
            r.ingredients.forEachIndexed { k, i ->
                if (k > 0) RowDivider()
                val on = k in ticks.first
                Tick(on, onClick = { marks.flip(Part.Ingredient, k); ticks = marks.ingredients to marks.steps }) {
                    Text(Amounts.line(i, n.toDouble() / r.servings), style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp), color = if (on) p.inkSoft else p.ink, modifier = Modifier.width(84.dp))
                    Column(Modifier.weight(1f)) {
                        Text(i.food, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold, textDecoration = if (on) TextDecoration.LineThrough else null), color = if (on) p.inkSoft else p.ink)
                        if (i.note.isNotBlank()) Text(i.note, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                    }
                }
            }
        }
        if (page.date != null) GhostButton(MealText.SHOP_RECIPE, { shop = true }, Modifier.fillMaxWidth().padding(top = 12.dp))
        SectionHead(MealText.STEPS)
        r.steps.forEachIndexed { k, step ->
            val on = k in ticks.second
            Box(Modifier.padding(bottom = 8.dp)) {
                BoxCard {
                    Tick(on, onClick = { marks.flip(Part.Step, k); ticks = marks.ingredients to marks.steps }) {
                        Text("${k + 1}", style = MaterialTheme.typography.titleLarge, color = if (on) p.inkSoft else p.primary, modifier = Modifier.width(28.dp))
                        Text(step, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp, lineHeight = 25.sp, textDecoration = if (on) TextDecoration.LineThrough else null), color = if (on) p.inkSoft else p.ink, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        Text(MealText.AWAKE, style = MaterialTheme.typography.bodySmall, color = p.inkSoft, modifier = Modifier.padding(top = 6.dp))
    }
    if (shop && page.date != null) ShopSheet(api, listOf(page.date), servings ?: recipe?.servings, onClose = { shop = false }, onOpenList = { shop = false; onOpenList(it) })
}

@Composable
private fun Tick(on: Boolean, onClick: () -> Unit, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).toggleable(value = on, role = Role.Checkbox) { onClick() }.padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

/** Ingredients for the chosen days: what is needed ticked, the pantry asked about. */
@Composable
fun ShopSheet(api: MealsApi, dates: List<LocalDate>, servings: Int?, onClose: () -> Unit, onOpenList: (String) -> Unit) {
    val p = LocalPalette.current
    val model = remember(dates, servings) { ShopModel(api) }
    val s by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(model) { model.load(dates, servings) }
    Sheet(MealText.SHOP_TITLE, onClose) {
        s.error?.let { Notice(it) }
        val done = s.done
        val pv = s.preview
        if (done != null) {
            Text(done, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.fillMaxWidth().clip(RadiusSm).background(p.field).padding(14.dp))
            s.doneListId?.let { id -> GhostButton(MealText.TO_LIST, { onOpenList(id) }, Modifier.fillMaxWidth()) }
            PrimaryButton(MealText.FINISHED, onClose, Modifier.fillMaxWidth())
        } else if (pv != null) {
            if (pv.missing.isNotEmpty()) Notice(MealText.missing(pv.missing.joinToString(", ")))
            if (pv.special.isEmpty() && pv.pantry.isEmpty()) Text(MealText.NOTHING_TO_BUY, color = p.inkSoft, style = MaterialTheme.typography.bodyLarge)
            for (g in listOf(LineGroup(MealText.SPECIAL, null, "s:", pv.special), LineGroup(MealText.PANTRY, MealText.PANTRY_HINT, "p:", pv.pantry))) {
                val (title, hint, prefix, list) = g
                if (list.isEmpty()) continue
                Text(title, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
                if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                for (l in list) {
                    val key = ShopState.key(prefix, l)
                    val on = key in s.picked
                    Row(
                        Modifier.fillMaxWidth().clip(RadiusSm).background(p.field).toggleable(value = on, role = Role.Checkbox) { model.toggle(key) }.padding(end = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = on, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = p.primary, checkmarkColor = p.primaryInk))
                        Text(l.food, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = p.ink, modifier = Modifier.weight(1f).padding(start = 4.dp))
                        if (l.display.isNotBlank()) Text(l.display, style = MaterialTheme.typography.titleMedium.copy(fontSize = 15.sp), color = p.ink)
                    }
                }
            }
            PrimaryButton(MealText.putOn(s.lines.size, pv.listName), { scope.launch { model.commit() } }, Modifier.fillMaxWidth(), enabled = !s.busy && s.lines.isNotEmpty())
            GhostButton(MealText.CANCEL, onClose, Modifier.fillMaxWidth())
        }
    }
}

private data class LineGroup(val title: String, val hint: String?, val prefix: String, val lines: List<app.stellwall.api.ShopLine>)

@Composable
fun PantryScreen(model: PantryModel, onBack: () -> Unit) {
    val p = LocalPalette.current
    val list by model.list.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(model) { model.load() }
    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        BackLink(MealText.PAGE, onBack)
        PageHead(MealText.STAPLES, MealText.PAGE)
        Text(MealText.STAPLES_LEAD, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft, modifier = Modifier.padding(bottom = 12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(name, { name = it.take(80) }, Modifier.weight(1f), label = { Text(MealText.STAPLE_NAME) }, singleLine = true, colors = fieldColors())
            PrimaryButton(MealText.STAPLE_ADD, { scope.launch { error = model.add(name); if (error == null) name = "" } }, enabled = name.isNotBlank())
        }
        error?.let { Notice(it, Modifier.padding(top = 8.dp)) }
        val rows = list.orEmpty()
        if (rows.isNotEmpty()) BoxCard(Modifier.padding(top = 14.dp)) {
            rows.forEachIndexed { n, st ->
                if (n > 0) RowDivider()
                Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(st.name, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.weight(1f))
                    Box(
                        Modifier.size(52.dp).clickable(role = Role.Button) { scope.launch { model.remove(st) } }.semantics { contentDescription = MealText.stapleRemove(st.name) },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.vector(Icons.TRASH), contentDescription = null, tint = p.inkSoft, modifier = Modifier.size(22.dp)) }
                }
            }
        }
    }
}
