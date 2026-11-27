package app.stellwall.push

import app.stellwall.Tab
import app.stellwall.start.Target
import java.time.LocalDate

/** Where a notification's web address leads in the app (the server sends the web app's paths). */
object Links {
    fun target(url: String): Target {
        val path = url.substringBefore('?')
        val query = url.substringAfter('?', "").split('&').mapNotNull { p -> p.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to java.net.URLDecoder.decode(it[1], Charsets.UTF_8) } }.toMap()
        return when {
            path == "/einkauf" -> Target(Tab.Einkauf, listId = query["liste"])
            path == "/kalender/geburtstage" -> Target(Tab.Kalender, birthdays = true)
            path.startsWith("/kalender") -> Target(Tab.Kalender, date = query["tag"]?.let { runCatching { LocalDate.parse(it) }.getOrNull() })
            path.startsWith("/todos") -> Target(Tab.Todos)
            path.startsWith("/essen") -> Target(Tab.Essen)
            path.startsWith("/mehr") -> Target(Tab.Start, more = true)
            path.startsWith("/dokumente") -> Target(Tab.Start, documents = true, documentId = path.removePrefix("/dokumente").trim('/').ifEmpty { null })
            else -> Target(Tab.Start)
        }
    }
}
