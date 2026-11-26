package app.stellwall.api

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** The address people type in: a bare host gets https, any path is dropped. */
object ServerAddress {
    fun parse(input: String): HttpUrl? {
        val text = input.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return null
        val withScheme = if ("://" in text) text else "https://$text"
        val url = withScheme.toHttpUrlOrNull() ?: return null
        if (url.host.isEmpty()) return null
        return url.newBuilder().encodedPath("/").query(null).fragment(null).build()
    }
}
