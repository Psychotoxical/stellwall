package app.stellwall.api

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Where the jar keeps its cookies between app starts. */
interface CookieStore {
    fun read(): String?
    fun write(value: String?)
}

class MemoryCookieStore : CookieStore {
    private var value: String? = null
    override fun read() = value
    override fun write(value: String?) { this.value = value }
}

/**
 * Keeps the session cookie across app starts. Each line is "url<TAB>Set-Cookie", so a
 * host-only cookie keeps its host when it is read back.
 */
class SessionCookieJar(private val store: CookieStore) : CookieJar {
    private data class Entry(val url: HttpUrl, val cookie: Cookie)

    private fun load(now: Long): List<Entry> = store.read().orEmpty().lines().mapNotNull { line ->
        val (u, c) = line.split('\t', limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
        val url = u.toHttpUrlOrNull() ?: return@mapNotNull null
        Cookie.parse(url, c)?.takeIf { it.expiresAt > now }?.let { Entry(url, it) }
    }

    private fun save(entries: List<Entry>) =
        store.write(entries.joinToString("\n") { "${it.url}\t${it.cookie}" }.ifEmpty { null })

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val now = System.currentTimeMillis()
        val kept = load(now).filter { old -> cookies.none { it.name == old.cookie.name && it.domain == old.cookie.domain && it.path == old.cookie.path } }
        save(kept + cookies.filter { it.expiresAt > now }.map { Entry(url, it) })
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> = load(System.currentTimeMillis()).map { it.cookie }.filter { it.matches(url) }

    @Synchronized
    fun clear() = store.write(null)
}
