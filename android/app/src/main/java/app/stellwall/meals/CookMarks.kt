package app.stellwall.meals

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

enum class Part { Ingredient, Step }

/** Where the marks live: plain app settings on this phone. */
interface MarkStore {
    fun all(): Map<String, String>
    fun put(key: String, value: String)
    fun remove(key: String)
}

class PrefsMarkStore(context: Context) : MarkStore {
    private val prefs = context.getSharedPreferences("stellwall-cook", Context.MODE_PRIVATE)
    override fun all(): Map<String, String> = prefs.all.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
    override fun put(key: String, value: String) = prefs.edit().putString(key, value).apply()
    override fun remove(key: String) = prefs.edit().remove(key).apply()
}

@Serializable
private data class Marks(val i: List<Int> = emptyList(), val s: List<Int> = emptyList(), val at: Long = 0)

/** What the cook already did, kept on this phone per recipe and day; a week later it is gone (as the web app). */
class CookMarks(private val store: MarkStore, slug: String, day: String, private val now: () -> Long = System::currentTimeMillis) {
    private val key = "sw-cook:$slug:$day"
    private var marks: Marks

    init {
        for ((k, v) in store.all()) {
            if (!k.startsWith("sw-cook:")) continue
            val old = runCatching { Json.decodeFromString(Marks.serializer(), v) }.getOrNull()
            if (old == null || now() - old.at > WEEK) store.remove(k)
        }
        marks = store.all()[key]?.let { runCatching { Json.decodeFromString(Marks.serializer(), it) }.getOrNull() } ?: Marks(at = now())
    }

    val ingredients: Set<Int> get() = marks.i.toSet()
    val steps: Set<Int> get() = marks.s.toSet()

    fun flip(part: Part, n: Int) {
        fun List<Int>.flip() = if (n in this) this - n else this + n
        marks = if (part == Part.Ingredient) marks.copy(i = marks.i.flip(), at = now()) else marks.copy(s = marks.s.flip(), at = now())
        store.put(key, Json.encodeToString(Marks.serializer(), marks))
    }

    private companion object {
        const val WEEK = 7L * 86_400_000
    }
}
