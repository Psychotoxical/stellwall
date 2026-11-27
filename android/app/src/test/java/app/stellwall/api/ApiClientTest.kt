package app.stellwall.api

import java.io.IOException
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class ApiClientTest {
    private val server = MockWebServer()
    private val store = MemoryCookieStore()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun client() = ApiClient(server.url("/"), store)

    private fun session() = Contract.response("login-ok").newBuilder()
        .addHeader("Set-Cookie", "sw_session=token-1; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax")
        .build()

    @Test fun `login sends the app header and the credentials, and reads the member`() = runTest {
        server.enqueue(session())
        val me = client().login("alex", "correct-horse-1")
        assertEquals(Member("00000000-0000-4000-8000-000000000001", "alex", "Alex", "admin", "person-mint", "salbei"), me)
        val req = server.takeRequest()
        assertEquals("/api/auth/login", req.url.encodedPath)
        assertEquals("1", req.headers["X-Stellwall"])
        assertEquals("""{"username":"alex","password":"correct-horse-1"}""", req.body?.utf8())
    }

    @Test fun `the session cookie survives a new client`() = runTest {
        server.enqueue(session())
        client().login("alex", "correct-horse-1")
        server.takeRequest()
        server.enqueue(Contract.response("me"))
        val me = client().me()
        assertEquals("alex", me?.username)
        assertEquals("sw_session=token-1", server.takeRequest().headers["Cookie"])
    }

    @Test fun `signed out, me is null`() = runTest {
        server.enqueue(Contract.response("me-signed-out"))
        assertNull(client().me())
    }

    @Test fun `a wrong password is the invalid error`() = runTest {
        server.enqueue(Contract.response("login-invalid"))
        val e = expectApiError { client().login("alex", "wrong-password") }
        assertEquals(401, e.status)
        assertEquals("invalid", e.code)
    }

    @Test fun `too many tries is the locked error with its end`() = runTest {
        server.enqueue(Contract.response("login-locked"))
        val e = expectApiError { client().login("alex", "wrong-6-pass") }
        assertEquals("locked", e.code)
        assertEquals("2026-11-26T10:15:00.000Z", e.until)
    }

    @Test fun `logout forgets the cookie`() = runTest {
        server.enqueue(session())
        client().login("alex", "correct-horse-1")
        server.enqueue(Contract.response("logout"))
        client().logout()
        assertTrue(SessionCookieJar(store).loadForRequest(server.url("/api/me")).isEmpty())
    }

    @Test fun `logout forgets the cookie even when the server is gone`() = runTest {
        server.enqueue(session())
        client().login("alex", "correct-horse-1")
        server.close()
        client().logout()
        assertTrue(SessionCookieJar(store).loadForRequest(server.url("/api/me")).isEmpty())
    }

    @Test fun `an unreachable server is an IOException`() = runTest {
        val url = server.url("/")
        server.close()
        try {
            ApiClient(url, store).me()
            fail("expected IOException")
        } catch (_: IOException) {
        }
    }

    private suspend fun expectApiError(block: suspend () -> Unit): ApiException {
        try {
            block()
        } catch (e: ApiException) {
            return e
        }
        throw AssertionError("expected ApiException")
    }
}
