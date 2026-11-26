package app.stellwall.api

import kotlinx.serialization.Serializable

@Serializable
data class RecipeRef(val id: String, val slug: String, val name: String)

@Serializable
data class RecipeSummary(val id: String, val slug: String, val name: String, val servings: Int, val hasImage: Boolean)

@Serializable
data class Ingredient(val quantity: Double?, val unit: String?, val food: String, val note: String)

@Serializable
data class Recipe(
    val id: String,
    val slug: String,
    val name: String,
    val servings: Int,
    val hasImage: Boolean,
    val ingredients: List<Ingredient>,
    val steps: List<String>,
)

/** Lunch on one day: a recipe from Mealie or a free text. */
@Serializable
data class Meal(val date: String, val recipe: RecipeRef?, val text: String?, val cookId: String?, val servings: Int, val updatedBy: String)

/** What a meal is saved as; exactly one of [recipe] and [text] is set. Nulls are sent, the server wants both keys. */
@Serializable
data class MealBody(val recipe: RecipeRef?, val text: String?, val cookId: String?, val servings: Int)

@Serializable
data class ShopLine(val food: String, val quantity: String, val display: String = "")

@Serializable
data class ShopPreview(val listId: String, val listName: String, val special: List<ShopLine>, val pantry: List<ShopLine>, val missing: List<String>)

@Serializable
data class CommitResult(val added: Int, val listId: String, val listName: String)

@Serializable
data class Staple(val id: String, val name: String, val variants: List<String>)

@Serializable
internal data class ShopRequest(val dates: List<String>, val servings: Int? = null)

@Serializable
internal data class CommitLine(val food: String, val quantity: String)

@Serializable
internal data class CommitRequest(val lines: List<CommitLine>)

@Serializable
internal data class NewStaple(val name: String)

@Serializable
data class Done(val by: String, val at: String)

/** One to-do on one day (or without a day). */
@Serializable
data class Occurrence(
    val todoId: String,
    val title: String,
    val date: String?,
    val at: String?,
    val overdue: Boolean,
    val done: Done?,
    val assignees: List<String>,
    val needsConfirm: Boolean,
    val everyone: Boolean,
    val createdBy: String,
)

/** none, daily, weekly (weekdays 1 = Monday) or monthly (day of month). */
@Serializable
data class Recurrence(val kind: String, val weekdays: List<Int>? = null, val day: Int? = null)

@Serializable
data class TodoRule(
    val id: String,
    val title: String,
    val visibility: Visibility,
    val createdBy: String,
    val assignees: List<String>,
    val startDate: String?,
    val time: String?,
    val recurrence: Recurrence,
    val until: String?,
    val needsConfirm: Boolean,
    val reminders: List<Int>,
)

/** A new or changed to-do; [visibility] only from its creator. */
@Serializable
data class TodoBody(
    val title: String,
    val assignees: List<String>,
    val startDate: String?,
    val time: String?,
    val recurrence: Recurrence,
    val until: String?,
    val needsConfirm: Boolean,
    val reminders: List<Int>,
    val visibility: Visibility? = null,
)

@Serializable
internal data class DoneRequest(val date: String)

@Serializable
internal data class NameOnly(val name: String)
