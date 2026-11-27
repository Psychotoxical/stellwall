package app.stellwall.more

import app.stellwall.Tab
import app.stellwall.api.AccountApi
import app.stellwall.api.ApiClient
import app.stellwall.api.ApiException
import app.stellwall.api.AppInfo
import app.stellwall.api.AppVersion
import app.stellwall.api.Contract
import app.stellwall.api.Member
import app.stellwall.api.MemberChange
import app.stellwall.api.MemoryCookieStore
import app.stellwall.api.PushDevice
import app.stellwall.push.Links
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AccountApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun api() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `own name, colour and world, password, prefs, devices and app info parse`() = runTest {
        server.enqueue(Contract.response("member-updated"))
        server.enqueue(Contract.response("password-wrong"))
        server.enqueue(Contract.response("notification-prefs"))
        server.enqueue(Contract.response("push-subscriptions"))
        server.enqueue(Contract.response("app-info"))
        server.enqueue(Contract.response("push-test"))
        val m = api().updateMember("m1", MemberChange(displayName = "Sammy", world = "rose"))
        assertEquals("""{"displayName":"Sammy","world":"rose"}""", server.takeRequest().body?.utf8())
        assertEquals("rose", m.world)
        try {
            api().changePassword("wrong-password", "new-password-1")
            throw AssertionError("expected ApiException")
        } catch (e: ApiException) {
            assertEquals(401, e.status)
        }
        assertEquals(true, api().notificationPrefs()["shopping"])
        assertEquals("Galaxy", api().pushDevices().single().label)
        assertEquals(AppInfo(fcm = true, android = AppVersion(7, "0.2.0")), api().appInfo())
        assertEquals(1, api().pushTest())
    }

    @Test fun `a phone registers with its token, and signing out takes it along`() = runTest {
        server.enqueue(Contract.response("push-fcm-registered"))
        server.enqueue(Contract.response("logout"))
        api().registerFcm("device-token-1-0123456789abcdef", "Galaxy")
        assertEquals("""{"token":"device-token-1-0123456789abcdef","label":"Galaxy"}""", server.takeRequest().body?.utf8())
        api().logout(pushEndpoint = "fcm:device-token-1-0123456789abcdef")
        assertEquals("""{"pushEndpoint":"fcm:device-token-1-0123456789abcdef"}""", server.takeRequest().body?.utf8())
    }

    @Test fun `without an app on the server there is no update`() = runTest {
        server.enqueue(Contract.response("app-info-none"))
        assertNull(api().appInfo().android)
    }
}

class FakeAccount : AccountApi {
    val calls = mutableListOf<String>()
    var passwordError: ApiException? = null
    var prefs = mutableMapOf("event" to true, "shopping" to true)
    override suspend fun updateMember(id: String, change: MemberChange) =
        Member(id, "alex", change.displayName ?: "Alex", "admin", change.color ?: "person-mint", change.world ?: "salbei").also { calls += "update:$change" }
    override suspend fun changePassword(current: String, next: String) { passwordError?.let { throw it }; calls += "password" }
    override suspend fun notificationPrefs(): Map<String, Boolean> = prefs.toMap()
    override suspend fun setNotificationPref(kind: String, on: Boolean) { prefs[kind] = on; calls += "pref:$kind:$on" }
    override suspend fun pushDevices() = listOf(PushDevice("d1", "Galaxy", "2026-11-27T10:00:00.000Z"))
    override suspend fun deletePushDevice(id: String) { calls += "deleteDevice:$id" }
    override suspend fun registerFcm(token: String, label: String) { calls += "fcm:$token:$label" }
    override suspend fun pushTest() = 1
    override suspend fun appInfo() = AppInfo(true, AppVersion(7, "0.2.0"))
    override suspend fun downloadApk(to: File) { to.writeText("apk"); calls += "download" }
}

class AccountModelTest {
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")

    @Test fun `saving name, colour and world hands back the new member`() = runTest {
        val f = FakeAccount()
        var changed: Member? = null
        val m = AccountModel(f, me) { changed = it }
        assertNull(m.saveProfile(" Alexa ", "person-sky", "rose"))
        assertEquals("rose", changed?.world)
        assertTrue(f.calls.last().contains("displayName=Alexa"))
        assertEquals("Bitte die Eingaben prüfen.", m.saveProfile(" ", "person-sky", "rose"))
    }

    @Test fun `password mistakes read like the web app`() = runTest {
        val f = FakeAccount()
        val m = AccountModel(f, me) {}
        assertEquals("Mindestens 10 Zeichen.", m.changePassword("old-password-1", "short"))
        f.passwordError = ApiException(401, "invalid")
        assertEquals("Das aktuelle Passwort stimmt nicht.", m.changePassword("wrong", "new-password-1"))
        f.passwordError = null
        assertNull(m.changePassword("old-password-1", "new-password-1"))
    }

    @Test fun `switching a kind off sends only that kind, the test names the devices`() = runTest {
        val f = FakeAccount()
        val n = NotifyModel(f)
        n.load()
        n.set("shopping", false)
        assertEquals("pref:shopping:false", f.calls.last())
        assertEquals(false, n.state.value.prefs["shopping"])
        assertEquals("Auf 1 Gerät geschickt.", n.test())
    }
}

class LinksTest {
    @Test fun `a notification opens where it belongs`() {
        assertEquals(Tab.Einkauf, Links.target("/einkauf?liste=l1").tab)
        assertEquals("l1", Links.target("/einkauf?liste=l1").listId)
        assertEquals(LocalDate.of(2026, 12, 2), Links.target("/kalender?tag=2026-12-02").date)
        assertEquals(true, Links.target("/kalender/geburtstage").birthdays)
        assertEquals(Tab.Todos, Links.target("/todos").tab)
        assertEquals(Tab.Essen, Links.target("/essen").tab)
        assertEquals(true, Links.target("/mehr").more)
        assertEquals(Tab.Start, Links.target("https://elsewhere.example/").tab)
    }
}

class UpdateTest {
    @Test fun `an update is there when the server has a newer version`() {
        assertEquals(true, Updates.newer(AppInfo(true, AppVersion(7, "0.2.0")), installed = 6))
        assertEquals(false, Updates.newer(AppInfo(true, AppVersion(7, "0.2.0")), installed = 7))
        assertEquals(false, Updates.newer(AppInfo(false, null), installed = 1))
    }
}
