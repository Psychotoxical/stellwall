package app.stellwall.api

import kotlinx.serialization.Serializable

/** A family member as the server sends it (MemberDto). */
@Serializable
data class Member(
    val id: String,
    val username: String,
    val displayName: String,
    val role: String,
    val color: String,
    val world: String,
    /** The administration chose the password; the member is asked for an own one first. */
    val mustChangePassword: Boolean = false,
)

@Serializable
internal data class Credentials(val username: String, val password: String)

@Serializable
internal data class ErrorBody(val error: String = "", val until: String? = null)

/** The server answered, but with an error: [code] is its `error` field. */
class ApiException(val status: Int, val code: String, val until: String? = null) : Exception("HTTP $status $code")

/** Who sees a list or a to-do: everyone, or the listed members (the creator is always among them). */
@Serializable
data class Visibility(val everyone: Boolean, val memberIds: List<String>)

@Serializable
data class ShoppingList(val id: String, val name: String, val visibility: Visibility, val createdBy: String, val openCount: Int)

@Serializable
data class Item(
    val id: String,
    val listId: String,
    val name: String,
    val quantity: String,
    val category: String,
    val addedBy: String,
    val addedAt: String,
    val checkedAt: String?,
    val checkedBy: String?,
)

/** learned: typed in by the family, so it can be forgotten again. */
@Serializable
data class Suggestion(val name: String, val category: String, val learned: Boolean = false)

/** The section a name would get; known: the catalog or the family has it, so nobody has to choose. */
@Serializable
data class CatalogGuess(val name: String, val category: String, val known: Boolean)

@Serializable
data class LearnedEntry(val name: String, val category: String)

@Serializable
internal data class LearnedChange(val name: String, val category: String)

/** Only the fields that are set are sent. */
@Serializable
data class ItemChange(val checked: Boolean? = null, val name: String? = null, val quantity: String? = null, val category: String? = null)

@Serializable
internal data class NewItem(val name: String, val quantity: String? = null, val category: String? = null)

@Serializable
internal data class NewList(val name: String, val visibility: Visibility)

@Serializable
internal data class ListChange(val name: String? = null, val visibility: Visibility? = null)

/** One line on the board "Seit du zuletzt hier warst". */
sealed interface BoardRow {
    val who: String
    val whoName: String
    val latestAt: String

    @Serializable
    data class Shopping(
        override val who: String,
        override val whoName: String,
        val listId: String,
        val listName: String,
        val count: Int,
        override val latestAt: String,
        val itemIds: List<String>,
    ) : BoardRow

    @Serializable
    data class Todo(override val who: String, override val whoName: String, val todoId: String, val title: String, override val latestAt: String) : BoardRow

    @Serializable
    data class Event(
        override val who: String,
        override val whoName: String,
        val eventId: String,
        val title: String,
        val start: String,
        val allDay: Boolean,
        override val latestAt: String,
    ) : BoardRow
}

/** A hint from the live connection: something changed, fetch it again. */
sealed interface LiveEvent {
    /** (Re)connected: anything may have changed while away. */
    data object Connected : LiveEvent
    data class List(val id: String) : LiveEvent
    data object Lists : LiveEvent
    data object Calendar : LiveEvent
    data object Todos : LiveEvent
    data object Meals : LiveEvent
    data object Documents : LiveEvent
}

/** Store sections in shop order, as the server's shared code has them (checked against contract/categories.json). */
val CATEGORIES = listOf(
    "Obst & Gemüse", "Backwaren", "Kühlregal", "Fleisch & Fisch", "Tiefkühl", "Vorrat", "Frühstück",
    "Süßes & Snacks", "Getränke", "Drogerie", "Haushalt", "Tier", "Sonstiges",
)
