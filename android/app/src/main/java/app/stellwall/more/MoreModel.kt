package app.stellwall.more

import app.stellwall.api.AccountApi
import app.stellwall.api.ApiException
import app.stellwall.api.AppInfo
import app.stellwall.api.Member
import app.stellwall.api.MemberChange
import app.stellwall.api.PushDevice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** The web app's wording for Mehr, account and notifications (web/src/text/de.ts). */
object MoreText {
    const val PAGE = "Mehr"
    const val ACCOUNT = "Mein Konto"
    const val PROFILE = "Name und Farbe"
    const val NAME = "Anzeigename"
    const val COLOR = "Farbe"
    const val COLOR_HINT = "Deine Kennfarbe: daran erkennen dich die anderen, zum Beispiel im Kalender."
    const val WORLD = "Deine Farbwelt"
    const val WORLD_HINT = "Die App nimmt deine Farbe an, auf allen deinen Geräten."
    val WORLDS = listOf("salbei" to "Salbei", "flieder" to "Flieder", "pfirsich" to "Pfirsich", "himmel" to "Himmel", "rose" to "Rosé", "sonne" to "Sonne", "pink" to "Pink", "psysonic" to "Psysonic")
    val COLORS = listOf("person-mint", "person-lilac", "person-peach", "person-sky")
    const val THEME = "Darstellung"
    const val THEME_HINT = "Gilt für dieses Gerät."
    const val PASSWORD = "Passwort ändern"
    const val CURRENT = "Aktuelles Passwort"
    const val NEW = "Neues Passwort"
    const val HINT = "Mindestens 10 Zeichen."
    const val CHANGED = "Passwort geändert."
    const val WRONG = "Das aktuelle Passwort stimmt nicht."
    const val SAVED = "Gespeichert."
    const val SAVE = "Speichern"
    const val LOGOUT = "Auf diesem Gerät abmelden"
    const val INVALID = "Bitte die Eingaben prüfen."
    const val GENERIC = "Das hat nicht geklappt. Bitte noch einmal versuchen."

    const val NOTIFY = "Benachrichtigungen"
    const val NOTIFY_TITLE = "Worüber willst du Bescheid bekommen?"
    const val STEP1 = "Auf diesem Gerät erlauben"
    const val STEP2 = "Was gemeldet wird"
    const val STEP3 = "Ausprobieren"
    const val ALLOW = "Benachrichtigungen erlauben"
    const val ON = "Dieses Gerät bekommt Nachrichten."
    const val DENIED = "Benachrichtigungen sind für Stellwall blockiert. Erlaube sie in den Android-Einstellungen, dann hier noch einmal versuchen."
    const val OPEN_SETTINGS = "Einstellungen öffnen"
    const val NO_FCM = "Der Server kann Handys noch nicht benachrichtigen. Die Verwaltung richtet das ein."
    const val NO_BUILD = "In dieser App-Version sind Benachrichtigungen noch nicht eingerichtet."
    val KINDS = listOf(
        "event" to "Termine für mich",
        "event_reminder" to "Termin-Erinnerungen",
        "todo" to "To-dos, die mir jemand gibt",
        "todo_reminder" to "To-do-Erinnerungen",
        "shopping" to "Einkaufslisten",
        "birthday" to "Geburtstage",
        "meal" to "Essensplan: als Koch eingetragen",
        "document_expiry" to "Ablaufende Dokumente",
    )
    const val QUIET = "Nachts von 22 bis 7 Uhr bleibt es still. Erinnerungen an Termine kommen trotzdem pünktlich."
    const val TEST = "Probe-Nachricht schicken"
    fun tested(n: Int) = if (n == 0) "Noch kein Gerät eingerichtet." else if (n == 1) "Auf 1 Gerät geschickt." else "Auf $n Geräte geschickt."
    const val DEVICES = "Deine Geräte"
    const val NO_DEVICES = "Noch kein Gerät bekommt Nachrichten."
    fun remove(label: String) = "$label entfernen"

    const val ABOUT = "Über Stellwall"
    fun version(v: String) = "Version $v"
    const val LICENSES = "Schriften: Sofia Sans, Sofia Sans Condensed und Fredoka unter der SIL Open Font License 1.1. Symbole: Solar von 480 Design unter CC BY 4.0."
    const val ADMIN = "Verwaltung im Browser"
    const val MEMBERS = "Mitglieder"
    const val MEALIE = "Mealie"
    const val IMPORT = "Kalender importieren"

    const val UPDATE = "Eine neue Version von Stellwall ist da."
    fun updateTo(v: String) = "Auf Version $v aktualisieren"
    const val UPDATING = "Wird geladen …"
    const val UPDATE_FAILED = "Die neue Version ließ sich nicht laden. Bitte noch einmal versuchen."
    const val ALLOW_INSTALL = "Android fragt einmal, ob Stellwall Updates installieren darf. Bitte erlauben, dann noch einmal tippen."
}

/** Name, colour, world and password. [onChanged] gets the member as the server has them now. */
class AccountModel(private val api: AccountApi, private val me: Member, private val onChanged: (Member) -> Unit) {
    suspend fun saveProfile(name: String, color: String, world: String): String? {
        if (name.isBlank()) return MoreText.INVALID
        return try {
            onChanged(api.updateMember(me.id, MemberChange(displayName = name.trim(), color = color, world = world)))
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            MoreText.GENERIC
        }
    }

    suspend fun changePassword(current: String, next: String): String? {
        if (next.length < 10) return MoreText.HINT
        return try {
            api.changePassword(current, next)
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            when ((e as? ApiException)?.status) {
                401 -> MoreText.WRONG
                400 -> MoreText.HINT
                else -> MoreText.GENERIC
            }
        }
    }
}

data class NotifyState(val prefs: Map<String, Boolean> = emptyMap(), val devices: List<PushDevice> = emptyList(), val error: String? = null)

class NotifyModel(private val api: AccountApi) {
    private val _state = MutableStateFlow(NotifyState())
    val state: StateFlow<NotifyState> = _state

    suspend fun load() {
        try {
            _state.value = NotifyState(api.notificationPrefs(), api.pushDevices())
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(error = MoreText.GENERIC) }
        }
    }

    suspend fun set(kind: String, on: Boolean) {
        val before = _state.value.prefs
        _state.update { it.copy(prefs = it.prefs + (kind to on), error = null) }
        try {
            api.setNotificationPref(kind, on)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(prefs = before, error = MoreText.GENERIC) }
        }
    }

    suspend fun register(token: String, label: String) {
        try {
            api.registerFcm(token, label)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(error = MoreText.GENERIC) }
        }
    }

    suspend fun test(): String = try {
        MoreText.tested(api.pushTest()).also { load() }
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        MoreText.GENERIC
    }

    suspend fun remove(d: PushDevice) {
        try {
            api.deletePushDevice(d.id)
            load()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
        }
    }
}

object Updates {
    fun newer(info: AppInfo, installed: Int): Boolean = (info.android?.versionCode ?: 0) > installed
}
