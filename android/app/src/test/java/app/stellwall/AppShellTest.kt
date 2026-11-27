package app.stellwall

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.onRoot
import app.stellwall.theme.StellwallTheme
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h780dp-xxhdpi")
class AppShellTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `five tabs, like the web app`() {
        compose.setContent { StellwallTheme(world = "rose", dark = false) { AppShell() } }
        for (tab in listOf("Start", "Einkauf", "Kalender", "Essen", "To-dos")) compose.onAllNodes(hasText(tab) and isSelectable()).assertCountEquals(1)
        compose.onRoot().captureRoboImage("src/test/screenshots/shell-rose.png")
    }
}
