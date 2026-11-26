package app.stellwall.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServerAddressTest {
    @Test fun `a bare host gets https`() = assertEquals("https://wall.example.org/", ServerAddress.parse(" wall.example.org ").toString())
    @Test fun `a given scheme and port stay`() = assertEquals("http://192.168.1.5:3000/", ServerAddress.parse("http://192.168.1.5:3000/").toString())
    @Test fun `a path is dropped`() = assertEquals("https://wall.example.org/", ServerAddress.parse("https://wall.example.org/kalender").toString())
    @Test fun `nonsense is null`() {
        assertNull(ServerAddress.parse(""))
        assertNull(ServerAddress.parse("ftp://x"))
        assertNull(ServerAddress.parse("nicht gültig"))
    }
}
