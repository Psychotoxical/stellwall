package app.stellwall.session

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import app.stellwall.theme.StellwallTheme
import app.stellwall.theme.ThemeChoice
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h780dp-xxhdpi")
class FirstPasswordTest {
    @get:Rule val compose = createComposeRule()

    @Test fun `right after sign-in only the new password is asked`() {
        var sent: Pair<String, String>? = null
        compose.setContent {
            StellwallTheme(world = "flieder", dark = false) {
                FirstPasswordScreen("Sam", known = "member-pass-1", onSubmit = { c, n -> sent = c to n; null }, onSignOut = {})
            }
        }
        compose.onNodeWithText(FirstPasswordText.CURRENT).assertDoesNotExist()
        // Pictured before typing: a focused field's blinking cursor makes every picture differ.
        compose.onRoot().captureRoboImage("src/test/screenshots/first-password.png")
        compose.onNodeWithText("Neues Passwort").performTextInput("my-own-secret-9")
        compose.waitForIdle()
        compose.onNode(hasText(FirstPasswordText.SUBMIT) and hasClickAction()).assertIsEnabled()
        compose.onNodeWithText("Neues Passwort").performImeAction()
        compose.waitForIdle()
        assertEquals("member-pass-1" to "my-own-secret-9", sent)
    }

    @Test fun `after a restart the password from the administration is asked too`() {
        var sent: Pair<String, String>? = null
        compose.setContent {
            StellwallTheme(world = "flieder", dark = true) {
                FirstPasswordScreen("Sam", known = null, onSubmit = { c, n -> sent = c to n; "Das aktuelle Passwort stimmt nicht." }, onSignOut = {})
            }
        }
        compose.onNodeWithText(FirstPasswordText.CURRENT).performTextInput("member-pass-1")
        compose.onNodeWithText("Neues Passwort").performTextInput("my-own-secret-9")
        compose.onNodeWithText("Neues Passwort").performImeAction()
        compose.waitForIdle()
        assertEquals("member-pass-1" to "my-own-secret-9", sent)
        compose.onNodeWithText("Das aktuelle Passwort stimmt nicht.").assertExists()
    }

    @Test fun `the greeting follows the time of day`() {
        val h = { hour: Int -> app.stellwall.start.StartText.hello("Frank", hour) }
        assertEquals("Guten Morgen, Frank", h(5))
        assertEquals("Guten Mittag, Frank", h(11))
        assertEquals("Guten Tag, Frank", h(14))
        assertEquals("Guten Abend, Frank", h(18))
        assertEquals("Gute Nacht, Frank", h(22))
        assertEquals("Gute Nacht, Frank", h(4))
    }

    @Test fun `light or dark follows the choice, the system only when chosen`() {
        assertEquals(false, ThemeChoice.dark(ThemeChoice.LIGHT, systemDark = true))
        assertEquals(true, ThemeChoice.dark(ThemeChoice.DARK, systemDark = false))
        assertEquals(true, ThemeChoice.dark(ThemeChoice.SYSTEM, systemDark = true))
        assertEquals(false, ThemeChoice.dark("unknown", systemDark = false))
    }
}
