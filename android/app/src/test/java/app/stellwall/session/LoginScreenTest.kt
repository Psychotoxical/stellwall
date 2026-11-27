package app.stellwall.session

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import app.stellwall.theme.StellwallTheme
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
class LoginScreenTest {
    @get:Rule val compose = createComposeRule()
    private val button = hasText("Anmelden") and hasClickAction()

    @Test fun `filled in, it sends all three and shows the answer`() {
        var sent: Triple<String, String, String>? = null
        compose.setContent {
            StellwallTheme(world = "flieder", dark = false) {
                LoginScreen(server = null, onSubmit = { s, u, p -> sent = Triple(s, u, p); "Benutzername oder Passwort stimmt nicht." })
            }
        }
        compose.onNode(button).assertIsNotEnabled()
        compose.onNodeWithText("Serveradresse").performTextInput("wall.example.org")
        compose.onNodeWithText("Benutzername").performTextInput("alex")
        compose.onNodeWithText("Passwort").performTextInput("correct-horse-1")
        compose.onNode(button).assertIsEnabled()
        // Sent with the keyboard's Done key: a tap would leave a ripple that differs between machines.
        compose.onNodeWithText("Passwort").performImeAction()
        compose.waitForIdle()
        assertEquals(Triple("wall.example.org", "alex", "correct-horse-1"), sent)
        compose.onNodeWithText("Benutzername oder Passwort stimmt nicht.").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/login.png")
    }

    @Test fun `a known address is filled in`() {
        compose.setContent { StellwallTheme(world = "flieder", dark = false) { LoginScreen(server = "https://wall.example.org/", onSubmit = { _, _, _ -> null }) } }
        compose.onNodeWithText("wall.example.org").assertExists()
    }
}
