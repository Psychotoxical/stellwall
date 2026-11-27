package app.stellwall

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.stellwall.api.Member
import app.stellwall.calendar.BirthdaysModel
import app.stellwall.calendar.CalendarModel
import app.stellwall.calendar.CalendarScreen
import app.stellwall.calendar.FakeCalendar
import app.stellwall.meals.FakeMeals
import app.stellwall.meals.MealsArea
import app.stellwall.meals.MealsModel
import app.stellwall.session.LoginScreen
import app.stellwall.shopping.SampleShopping
import app.stellwall.shopping.ShoppingModel
import app.stellwall.shopping.ShoppingScreen
import app.stellwall.start.StartModel
import app.stellwall.start.StartScreen
import app.stellwall.start.TodayModel
import app.stellwall.theme.StellwallTheme
import app.stellwall.todos.FakeTodos
import app.stellwall.todos.TodosModel
import app.stellwall.todos.TodosScreen
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

/** The main screens on a small phone with large text (320 dp wide, text at 130 %). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w320dp-h640dp-xhdpi", fontScale = 1.3f)
class SmallPhoneTest {
    @get:Rule val compose = createComposeRule()
    private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val day = LocalDate.of(2026, 12, 2)
    private val zone = ZoneId.of("Europe/Berlin")

    private fun shot(name: String, waitFor: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { StellwallTheme(world = "flieder", dark = false) { content() } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText(waitFor, substring = true)).fetchSemanticsNodes().isNotEmpty() }
        compose.onRoot().captureRoboImage("src/test/screenshots/small-$name.png")
    }

    @Test fun login() = shot("login", "Anmelden") { LoginScreen(server = "https://wall.example.org/", onSubmit = { _, _, _ -> null }) }

    @Test fun start() = shot("start", "Heute Mittag") {
        StartScreen(me, StartModel(board = { SampleShopping().board() }), today = day, hour = 9, mine = TodayModel(FakeTodos(), FakeCalendar(), FakeMeals(), zone) { day }, onMore = {}) {}
    }

    @Test fun shopping() = shot("shopping", "Obst") { SampleShopping().let { ShoppingScreen(ShoppingModel(it, it.me)) } }

    @Test fun calendar() = shot("calendar", "Dezember") {
        val f = FakeCalendar()
        CalendarScreen(CalendarModel(f, me, zone, { day }, { LocalDateTime.of(2026, 12, 2, 9, 0) }), BirthdaysModel(f, me) { day })
    }

    @Test fun meals() = shot("meals", "Sam kocht") { FakeMeals().let { MealsArea(MealsModel(it) { day }, it) } }

    @Test fun todos() = shot("todos", "Blumen") { TodosScreen(TodosModel(FakeTodos(), me)) }
}
