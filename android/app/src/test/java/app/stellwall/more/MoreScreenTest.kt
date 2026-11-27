package app.stellwall.more

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.stellwall.api.AppInfo
import app.stellwall.api.AppVersion
import app.stellwall.api.Member
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
class MoreScreenTest {
    @get:Rule val compose = createComposeRule()
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")

    @Test fun `Mehr shows the update, the account and picks a world`() {
        val f = FakeAccount()
        var changed: Member? = null
        compose.setContent {
            StellwallTheme(world = "salbei", dark = false) {
                MoreScreen(f, me, AppInfo(true, AppVersion(99, "0.9.0")), "https://wall.example.org", onMemberChanged = { changed = it }, onSignOut = {}, onBack = {})
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Eine neue Version von Stellwall ist da.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onRoot().captureRoboImage("src/test/screenshots/more.png")
        compose.onNodeWithText("Rosé").performScrollTo().performClick()
        compose.onNodeWithText("Speichern").performScrollTo().performClick()
        compose.waitUntil(5_000) { changed != null }
        assertEquals("rose", changed?.world)
        // This test build has no Firebase values: the app says so instead of failing.
        compose.onNodeWithText(MoreText.NO_BUILD).performScrollTo()
    }
}
