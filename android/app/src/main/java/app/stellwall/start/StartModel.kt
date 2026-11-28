package app.stellwall.start

import app.stellwall.api.BoardRow
import app.stellwall.api.LiveEvent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The board on Start; it follows the live hints that can change it. */
class StartModel(
    private val board: suspend () -> List<BoardRow>,
    private val dismiss: suspend (List<String>) -> Unit = {},
    private val seenAll: suspend () -> Unit = {},
) {
    private val _rows = MutableStateFlow<List<BoardRow>?>(null)
    val rows: StateFlow<List<BoardRow>?> = _rows

    suspend fun load() {
        try {
            _rows.value = board()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }

    /** A line stays until it is ticked off; it goes at once, the server catches up. */
    suspend fun seen(row: BoardRow) {
        _rows.value = _rows.value?.filter { it.keys != row.keys }
        quietly { dismiss(row.keys) }
        load()
    }

    suspend fun seenEverything() {
        _rows.value = emptyList()
        quietly { seenAll() }
        load()
    }

    private suspend fun quietly(f: suspend () -> Unit) {
        try {
            f()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }

    suspend fun onLive(event: LiveEvent) {
        if (event != LiveEvent.Meals) load()
    }
}

/** The web app's wording for Start (web/src/text/de.ts: home, board, areas). */
object StartText {
    private val de = Locale.GERMAN
    const val BOARD = "Seit du zuletzt hier warst"
    const val BOARD_EMPTY = "Noch nichts Neues. Sobald jemand etwas einträgt, steht es hier."
    const val AREAS = "Bereiche"
    const val SOON = "kommt bald"
    const val NEW = "NEU"
    const val SEEN = "Gesehen"
    const val SEEN_ALL = "Alle gesehen"
    fun seenLabel(what: String) = "Gesehen: $what"

    /** A greeting for the time of day, as in the web app. */
    fun hello(name: String, hour: Int) = when (hour) {
        in 5..10 -> "Guten Morgen, $name"
        in 11..13 -> "Guten Mittag, $name"
        in 14..17 -> "Guten Tag, $name"
        in 18..21 -> "Guten Abend, $name"
        else -> "Gute Nacht, $name"
    }
    fun count(n: Int) = if (n == 0) "alles gesehen" else "$n neu"
    fun today(d: LocalDate): String = DateTimeFormatter.ofPattern("EEEE, d. MMMM", de).format(d)
    fun time(iso: String, zone: ZoneId = ZoneId.systemDefault()): String = DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.parse(iso))

    fun area(r: BoardRow) = when (r) {
        is BoardRow.Shopping -> "Einkauf"
        is BoardRow.Todo -> "To-dos"
        is BoardRow.Event -> "Kalender"
    }

    fun line(r: BoardRow, zone: ZoneId = ZoneId.systemDefault()): String = when (r) {
        is BoardRow.Shopping -> "${r.whoName} hat ${if (r.count == 1) "1 Sache" else "${r.count} Sachen"} auf „${r.listName}“ gesetzt"
        is BoardRow.Todo -> "${r.whoName} hat dir „${r.title}“ gegeben"
        is BoardRow.Event -> {
            val start = Instant.parse(r.start).atZone(zone)
            val day = DateTimeFormatter.ofPattern("EEE, d.M.", de).format(start)
            "${r.whoName} hat dir einen Termin eingetragen: ${r.title}, $day${if (r.allDay) "" else " " + DateTimeFormatter.ofPattern("HH:mm").format(start)}"
        }
    }
}
