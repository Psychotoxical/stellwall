package app.stellwall.meals

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import app.stellwall.api.Member
import app.stellwall.calendar.FakeCalendar
import app.stellwall.start.StartModel
import app.stellwall.start.StartScreen
import app.stellwall.start.TodayModel
import app.stellwall.theme.StellwallTheme
import app.stellwall.todos.FakeTodos
import app.stellwall.todos.TodosModel
import app.stellwall.todos.TodosScreen
import com.github.takahirom.roborazzi.captureRoboImage
import java.time.LocalDate
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
class MealsScreenTest {
    @get:Rule val compose = createComposeRule()
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val day = LocalDate.of(2026, 12, 2)

    @Test fun `the week shows lunch and the cook, a recipe ticks off`() {
        val f = FakeMeals()
        val m = MealsModel(f, today = { day })
        compose.setContent { StellwallTheme(world = "pfirsich", dark = false) { MealsArea(m, f) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Sam kocht")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Reste").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/meals-week.png")
        compose.onNodeWithContentDescription("Rezept ansehen: Gemüsepfanne").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("So geht es")).fetchSemanticsNodes().isNotEmpty() }
        // Planned for 2, the recipe is for 4: half the rice.
        compose.onNodeWithText("100 g").assertExists()
        compose.onNodeWithText("Reis kochen.").performClick()
        compose.onRoot().captureRoboImage("src/test/screenshots/recipe.png")
    }

    @Test fun `to-dos and today on Start`() {
        val todos = FakeTodos()
        val tm = TodosModel(todos, me)
        compose.setContent { StellwallTheme(world = "sonne", dark = false) { TodosScreen(tm) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Blumen gießen")).fetchSemanticsNodes().isNotEmpty() }
        compose.onRoot().captureRoboImage("src/test/screenshots/todos.png")
    }

    @Test fun `start with today for me`() {
        val mine = TodayModel(FakeTodos(), FakeCalendar(), FakeMeals(), ZoneId.of("Europe/Berlin"), today = { day })
        compose.setContent {
            StellwallTheme(world = "salbei", dark = false) {
                StartScreen(me, StartModel(board = { emptyList() }), today = day, mine = mine) {}
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Heute Mittag: Reste")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Blumen gießen").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/start-today.png")
    }
}
