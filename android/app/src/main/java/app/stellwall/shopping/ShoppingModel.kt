package app.stellwall.shopping

import app.stellwall.api.BoardRow
import app.stellwall.api.CATEGORIES
import app.stellwall.api.Item
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
        runCatching { api.boardSeen() }
    }

    /** False when there was nothing to add or it failed. */
    suspend fun add(name: String, quantity: String, picked: Suggestion? = null): Boolean {
        val n = (picked?.name ?: name).trim()
        val list = _state.value.list ?: return false
        if (n.isEmpty()) return false
        return guard { api.addItem(list.id, n, quantity.trim(), picked?.category); refresh() }
    }

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

    suspend fun deleteList() = guard {
        _state.value.list?.let { api.deleteList(it.id) }
        _state.update { it.copy(list = null) }
        refresh()
    }

    suspend fun suggestions(q: String): List<Suggestion> = if (q.isBlank()) emptyList() else runCatching { api.suggestions(q.trim()) }.getOrDefault(emptyList())

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
