package app.stellwall.session

import app.stellwall.api.Backend
import app.stellwall.api.Member
import app.stellwall.api.ServerAddress
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** What the app remembers in plain settings (the session cookie is kept elsewhere, encrypted). */
interface Prefs {
    var server: String?
}

sealed interface AppState {
    data object Loading : AppState
    data object Unreachable : AppState
    data class SignedOut(val server: String?) : AppState
    data class SignedIn(val member: Member) : AppState
}

/** Signed in or not, and against which server. */
class AppModel<B : Backend>(private val prefs: Prefs, private val backendFor: (HttpUrl) -> B) {
    private val _state = MutableStateFlow<AppState>(AppState.Loading)
    val state: StateFlow<AppState> = _state
    var backend: B? = null
        private set

    /** The password typed at sign-in, kept in memory only, so the first own password needs no second typing. */
    var signInPassword: String? = null
        private set

    /** The server address, for links into the web app. */
    val server: String? get() = prefs.server

    /** On app start: is the stored session still good? */
    suspend fun start() {
        val url = prefs.server?.toHttpUrlOrNull()
        if (url == null) {
            _state.value = AppState.SignedOut(null)
            return
        }
        _state.value = AppState.Loading
        val b = backendFor(url)
        _state.value = try {
            b.me()?.let { backend = b; AppState.SignedIn(it) } ?: AppState.SignedOut(prefs.server)
        } catch (_: IOException) {
            AppState.Unreachable
        } catch (_: Exception) {
            AppState.SignedOut(prefs.server)
        }
    }

    /** Returns the error to show, or null when signed in. */
    suspend fun signIn(server: String, username: String, password: String): String? {
        val url = ServerAddress.parse(server) ?: return LoginText.BAD_ADDRESS
        val b = backendFor(url)
        return try {
            val me = b.login(username, password)
            prefs.server = url.toString()
            backend = b
            signInPassword = password
            _state.value = AppState.SignedIn(me)
            null
        } catch (e: Exception) {
            loginError(e)
        }
    }

    /** After a change to one's own profile: the new name and world show at once. */
    fun memberChanged(m: Member) {
        if (_state.value is AppState.SignedIn) _state.value = AppState.SignedIn(m)
    }

    suspend fun signOut(pushEndpoint: String? = null) {
        signInPassword = null
        backend?.logout(pushEndpoint)
        backend = null
        _state.value = AppState.SignedOut(prefs.server)
    }
}
