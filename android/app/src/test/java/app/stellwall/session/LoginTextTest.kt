package app.stellwall.session

import app.stellwall.api.ApiException
import java.io.IOException
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class LoginTextTest {
    private val berlin = ZoneId.of("Europe/Berlin")

    @Test fun `wrong credentials`() =
        assertEquals("Benutzername oder Passwort stimmt nicht.", loginError(ApiException(401, "invalid"), berlin))

    @Test fun `locked names the local time it ends`() =
        assertEquals("Zu viele Fehlversuche. Anmelden geht wieder ab 11:15.", loginError(ApiException(429, "locked", "2026-11-26T10:15:00.000Z"), berlin))

    @Test fun `no answer from the server`() =
        assertEquals("Server nicht erreichbar. Adresse und Internet prüfen.", loginError(IOException("refused"), berlin))

    @Test fun `anything else`() =
        assertEquals("Das hat nicht geklappt. Bitte noch einmal versuchen.", loginError(ApiException(500, ""), berlin))
}
