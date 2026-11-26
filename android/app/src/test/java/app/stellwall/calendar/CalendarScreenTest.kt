package app.stellwall.calendar

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import app.stellwall.api.Member
import app.stellwall.theme.StellwallTheme
import com.github.takahirom.roborazzi.captureRoboImage
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h780dp-xxhdpi")
class CalendarScreenTest {
    @get:Rule val compose = createComposeRule()
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val zone = ZoneId.of("Europe/Berlin")

    private fun models(f: FakeCalendar) =
        CalendarModel(f, me, zone, today = { LocalDate.of(2026, 12, 2) }, now = { LocalDateTime.of(2026, 12, 2, 9, 0) }) to BirthdaysModel(f, me, today = { LocalDate.of(2026, 12, 2) })

    @Test fun `month shows the day, a tapped day lists its events, tapping one opens the form`() {
        val f = FakeCalendar()
        val (cal, b) = models(f)
        compose.setContent { StellwallTheme(world = "himmel", dark = false) { CalendarScreen(cal, b) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Dezember 2026")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("An diesem Tag steht nichts an.").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/calendar-month.png")
        compose.onNodeWithContentDescription("Dienstag, 8. Dezember, 1").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Training")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Training").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Termin bearbeiten")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("jeden Dienstag").assertExists()
    }

    @Test fun `week as agenda, birthdays open from the calendar`() {
        val f = FakeCalendar()
        val (cal, b) = models(f)
        // Set in the model, not tapped: a tap leaves a ripple that differs from run to run in the picture.
        kotlinx.coroutines.runBlocking { cal.setView(View.Week) }
        compose.setContent { StellwallTheme(world = "himmel", dark = true) { CalendarScreen(cal, b) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Oma")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("wird 76").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/calendar-week-dark.png")
        compose.onNodeWithText("Geburtstage").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Wer hat wann Geburtstag?")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("3. Dezember · wird 76").assertExists()
    }
}
