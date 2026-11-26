package app.stellwall.api

import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class LiveClientTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    /** A server socket that says hello, sends [messages] and then hangs up. */
    private fun socket(vararg messages: String) = MockResponse.Builder().webSocketUpgrade(object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("""{"type":"hello"}""")
            messages.forEach { webSocket.send(it) }
            webSocket.close(1000, "bye")
        }
    }).build()

    @Test fun `hints arrive, and after a drop it connects again`() = runBlocking {
        server.enqueue(socket("""{"type":"list","id":"l1"}""", """{"type":"lists"}""", """{"type":"surprise"}"""))
        server.enqueue(socket("""{"type":"todos"}"""))
        val api = ApiClient(server.url("/"), MemoryCookieStore())
        val got = withTimeout(10_000) { api.live(retryMs = 50).take(5).toList() }
        // The unknown "surprise" is dropped; the drop leads to a second connection.
        assertEquals(listOf(LiveEvent.Connected, LiveEvent.List("l1"), LiveEvent.Lists, LiveEvent.Connected, LiveEvent.Todos), got)
        assertEquals("/api/live", server.takeRequest().url.encodedPath)
    }
}
