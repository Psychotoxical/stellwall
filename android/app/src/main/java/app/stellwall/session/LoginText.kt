package app.stellwall.session

import app.stellwall.api.ApiException
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** The same wording as the web app's sign-in page. */
object LoginText {
    const val TITLE = "Anmelden"
    const val SERVER = "Serveradresse"
    const val USERNAME = "Benutzername"
    const val PASSWORD = "Passwort"
    const val SUBMIT = "Anmelden"
    const val BAD_ADDRESS = "Die Serveradresse stimmt nicht."
    const val INVALID = "Benutzername oder Passwort stimmt nicht."
    const val UNREACHABLE = "Server nicht erreichbar. Adresse und Internet prüfen."
    const val GENERIC = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    fun locked(time: String) = "Zu viele Fehlversuche. Anmelden geht wieder ab $time."
}

fun loginError(e: Throwable, zone: ZoneId = ZoneId.systemDefault()): String = when {
    e is ApiException && e.code == "locked" && e.until != null -> runCatching {
        LoginText.locked(DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.parse(e.until)))
    }.getOrDefault(LoginText.GENERIC)
    e is ApiException && e.status == 401 -> LoginText.INVALID
    e is IOException -> LoginText.UNREACHABLE
    else -> LoginText.GENERIC
}
