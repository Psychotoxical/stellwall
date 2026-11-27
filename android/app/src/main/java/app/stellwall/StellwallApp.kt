package app.stellwall

import android.app.Application
import app.stellwall.api.ApiClient
import app.stellwall.session.AppModel
import app.stellwall.session.DevicePrefs
import app.stellwall.session.KeystoreCookieStore

/** Holds the sign-in state for the whole process, so it survives screen rotation. */
class StellwallApp : Application() {
    /** Where a tapped notification wants to go; the shell takes it and clears it. */
    val links = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

    override fun onCreate() {
        super.onCreate()
        app.stellwall.push.Push.init(this)
    }

    val model by lazy {
        val cookies = KeystoreCookieStore(this)
        AppModel(DevicePrefs(this), backendFor = { url -> ApiClient(url, cookies) })
    }
}
