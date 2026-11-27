package app.stellwall.shopping

import app.stellwall.api.quietly
import app.stellwall.api.BoardRow
import app.stellwall.api.CATEGORIES
import app.stellwall.api.Item
import app.stellwall.api.LearnedEntry
import app.stellwall.api.ItemChange
import app.stellwall.api.LiveEvent
import app.stellwall.api.Member
import app.stellwall.api.ShoppingApi
import app.stellwall.api.ShoppingList
import app.stellwall.api.Suggestion
import app.stellwall.api.Visibility
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

data class Group(val category: String, val items: List<Item>)

/** What the amount sheet is about; known false: the section still has to be chosen. */
data class Pick(val name: String, val category: String, val known: Boolean)

data class ShoppingState(
    val loaded: Boolean = false,
    val lists: List<ShoppingList> = emptyList(),
    val list: ShoppingList? = null,
    val items: List<Item> = emptyList(),
    val members: List<Member> = emptyList(),
    /** Items others added since the last look; frozen while the page is open. */
    val unseen: Set<String> = emptySet(),
    val error: String? = null,
) {
    val groups: List<Group>
        get() {
            val open = items.filter { it.checkedAt == null }
            val known = CATEGORIES.mapNotNull { c -> open.filter { it.category == c }.takeIf { it.isNotEmpty() }?.let { Group(c, it) } }
            val other = open.filter { it.category !in CATEGORIES }
            return if (other.isEmpty()) known else known + Group(CATEGORIES.last(), other)
        }
    val checked: List<Item> get() = items.filter { it.checkedAt != null }
}

/** The shopping page: which list is open, its items, and what was just changed. */
class ShoppingModel(private val api: ShoppingApi, val me: Member) {
    private val _state = MutableStateFlow(ShoppingState())
    val state: StateFlow<ShoppingState> = _state
    private var unseenFrozen: Set<String>? = null

    /** Opens [listId], or the first list. */
    suspend fun load(listId: String? = null) = guard {
        val lists = api.lists()
        val list = lists.firstOrNull { it.id == (listId ?: _state.value.list?.id) } ?: lists.firstOrNull()
        val members = if (_state.value.members.isEmpty()) api.members() else _state.value.members
        if (unseenFrozen == null) unseenFrozen = api.board().filterIsInstance<BoardRow.Shopping>().flatMap { it.itemIds }.toSet()
        val items = list?.let { api.items(it.id) }.orEmpty()
        _state.update { it.copy(loaded = true, lists = lists, list = list, items = items, members = members, unseen = unseenFrozen.orEmpty()) }
    }

    suspend fun select(listId: String) = load(listId)

    private suspend fun refresh() {
        val lists = api.lists()
        val list = lists.firstOrNull { it.id == _state.value.list?.id } ?: lists.firstOrNull()
        val items = list?.let { api.items(it.id) }.orEmpty()
        _state.update { it.copy(lists = lists, list = list, items = items) }
    }

    suspend fun onLive(event: LiveEvent) = guard(quiet = true) {
        when (event) {
            LiveEvent.Connected -> refresh()
            LiveEvent.Lists -> refresh()
            is LiveEvent.List -> if (event.id == _state.value.list?.id) refresh() else _state.update { it.copy(lists = api.lists()) }
            else -> Unit
        }
    }

    /** Leaving the page marks everything as seen. */
    suspend fun leave() {
        unseenFrozen = null
        quietly { api.boardSeen() }
    }

    /** A suggestion knows its section; a typed name asks the server what it would get. Null: nothing to add. */
    suspend fun pick(name: String, picked: Suggestion?, shown: List<Suggestion>): Pick? {
        if (picked != null) return Pick(picked.name, picked.category, true)
        val n = name.trim()
        if (n.isEmpty()) return null
        shown.firstOrNull { it.name.equals(n, ignoreCase = true) }?.let { return Pick(it.name, it.category, true) }
        val g = quietly { api.guess(n) } ?: return Pick(n, CATEGORIES.last(), false)
        return Pick(g.name, g.category, g.known)
    }

    /** False when it failed. */
    suspend fun add(pick: Pick, quantity: String, category: String): Boolean {
        val list = _state.value.list ?: return false
        return guard { api.addItem(list.id, pick.name, quantity.trim(), category); refresh() }
    }

    suspend fun forget(s: Suggestion) = guard { api.forgetLearned(s.name) }

    suspend fun learned(): List<LearnedEntry> = quietly { api.learned() } ?: emptyList()

    suspend fun moveLearned(name: String, category: String) = guard { api.moveLearned(name, category) }

    suspend fun forgetLearned(name: String) = guard { api.forgetLearned(name) }

    /** Shown at once; goes back if the server says no. */
    suspend fun toggle(item: Item) {
        val check = item.checkedAt == null
        val before = _state.value.items
        _state.update { s -> s.copy(error = null, items = s.items.map { if (it.id == item.id) it.copy(checkedAt = if (check) "now" else null, checkedBy = if (check) me.id else null) else it }) }
        val ok = guard { api.updateItem(item.id, ItemChange(checked = check)); refresh() }
        if (!ok) _state.update { it.copy(items = before) }
    }

    suspend fun edit(item: Item, name: String, quantity: String, category: String): Boolean {
        val change = ItemChange(
            name = name.trim().takeIf { it != item.name },
            quantity = quantity.trim().takeIf { it != item.quantity },
            category = category.takeIf { it != item.category },
        )
        if (change == ItemChange()) return true
        if (change.name?.isEmpty() == true) return false
        return guard { api.updateItem(item.id, change); refresh() }
    }

    suspend fun delete(item: Item) = guard { api.deleteItem(item.id); refresh() }

    suspend fun createList(name: String, visibility: Visibility) = guard {
        val l = api.createList(name.trim(), visibility)
        load(l.id)
    }

    suspend fun renameList(name: String) = guard { _state.value.list?.let { api.updateList(it.id, name = name.trim()) }; refresh() }

    suspend fun setVisibility(visibility: Visibility) = guard { _state.value.list?.let { api.updateList(it.id, visibility = visibility) }; refresh() }

    suspend fun clearList() = guard { _state.value.list?.let { api.clearList(it.id) }; refresh() }

    suspend fun deleteList() = guard {
        _state.value.list?.let { api.deleteList(it.id) }
        _state.update { it.copy(list = null) }
        refresh()
    }

    suspend fun suggestions(q: String): List<Suggestion> = if (q.isBlank()) emptyList() else quietly { api.suggestions(q.trim()) } ?: emptyList()

    fun clearError() = _state.update { it.copy(error = null) }

    private suspend fun guard(quiet: Boolean = false, block: suspend () -> Unit): Boolean = try {
        block()
        true
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        if (!quiet) _state.update { it.copy(error = ShopText.GENERIC) }
        false
    }
}

/** "Alle", "Nur ich" or the names, as in the web app. */
fun visibilityLabel(v: Visibility, members: List<Member>, meId: String): String = when {
    v.everyone -> ShopText.ALL
    v.memberIds.all { it == meId } -> ShopText.ONLY_ME
    else -> v.memberIds.joinToString(", ") { id -> members.firstOrNull { it.id == id }?.displayName ?: "?" }
}
