package app.stellwall.session

import app.stellwall.api.ApiException
import app.stellwall.api.Backend
import app.stellwall.api.Member
import java.io.IOException
import kotlinx.coroutines.test.runTest
import okhttp3.HttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppModelTest {
    private val alex = Member("m1", "alex", "Alex", "admin", "person-mint", "rose")

    private class FakeBackend(var me: () -> Member?, var login: () -> Member = { error("no login") }) : Backend {
        var loggedOut = false
        override suspend fun me() = me.invoke()
        override suspend fun login(username: String, password: String) = login.invoke()
        override suspend fun logout(pushEndpoint: String?) { loggedOut = true }
    }

    private class FakePrefs(override var server: String? = null) : Prefs

    @Test fun `without a server address it asks to sign in`() = runTest {
        val model = AppModel(FakePrefs(), backendFor = { error("no backend") })
        model.start()
        assertEquals(AppState.SignedOut(null), model.state.value)
    }

    @Test fun `a live session goes straight in`() = runTest {
        val model = AppModel(FakePrefs("https://wall.example.org/"), backendFor = { FakeBackend({ alex }) })
        model.start()
        assertEquals(AppState.SignedIn(alex), model.state.value)
    }

    @Test fun `an ended session asks to sign in, address kept`() = runTest {
        val model = AppModel(FakePrefs("https://wall.example.org/"), backendFor = { FakeBackend({ null }) })
        model.start()
        assertEquals(AppState.SignedOut("https://wall.example.org/"), model.state.value)
    }

    @Test fun `no answer shows unreachable`() = runTest {
        val model = AppModel(FakePrefs("https://wall.example.org/"), backendFor = { FakeBackend({ throw IOException("down") }) })
        model.start()
        assertEquals(AppState.Unreachable, model.state.value)
    }

    @Test fun `signing in stores the address and returns no error`() = runTest {
        val prefs = FakePrefs()
        var used: HttpUrl? = null
        val model = AppModel(prefs, backendFor = { used = it; FakeBackend({ null }, { alex }) })
        assertNull(model.signIn("wall.example.org", "alex", "pw"))
        assertEquals("https://wall.example.org/", used.toString())
        assertEquals("https://wall.example.org/", prefs.server)
        assertEquals(AppState.SignedIn(alex), model.state.value)
    }

    @Test fun `a bad address is an error and nothing is stored`() = runTest {
        val prefs = FakePrefs()
        val model = AppModel(prefs, backendFor = { error("no backend") })
        assertEquals("Die Serveradresse stimmt nicht.", model.signIn("nicht gültig", "alex", "pw"))
        assertNull(prefs.server)
    }

    @Test fun `a refused sign-in keeps the old address`() = runTest {
        val prefs = FakePrefs("https://old.example.org/")
        val model = AppModel(prefs, backendFor = { FakeBackend({ null }, { throw ApiException(401, "invalid") }) })
        assertEquals("Benutzername oder Passwort stimmt nicht.", model.signIn("wall.example.org", "alex", "pw"))
        assertEquals("https://old.example.org/", prefs.server)
    }

    @Test fun `signing out ends the session`() = runTest {
        val backend = FakeBackend({ alex })
        val model = AppModel(FakePrefs("https://wall.example.org/"), backendFor = { backend })
        model.start()
        model.signOut()
        assertEquals(true, backend.loggedOut)
        assertEquals(AppState.SignedOut("https://wall.example.org/"), model.state.value)
    }
}
