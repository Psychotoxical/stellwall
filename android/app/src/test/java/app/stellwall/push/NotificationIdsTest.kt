package app.stellwall.push

import app.stellwall.api.ApiClient
import app.stellwall.api.MemoryCookieStore
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationIdsTest {
    @Test fun `two messages of the same kind both stay in the shade`() {
        val ids = NotificationIds()
        val a = ids.next()
        val b = ids.next()
        assertNotEquals(a, b)
    }

    @Test fun `the live connection notices a dead link`() {
        val api = ApiClient("https://wall.example.org/".toHttpUrl(), MemoryCookieStore())
        assertTrue(api.liveClient.pingIntervalMillis in 1..60_000)
    }
}
