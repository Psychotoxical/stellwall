package app.stellwall.shopping

import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import app.stellwall.api.BoardRow
import app.stellwall.api.Item
import app.stellwall.api.ItemChange
import app.stellwall.api.Member
import app.stellwall.api.ShoppingApi
import app.stellwall.api.ShoppingList
import app.stellwall.api.Suggestion
import app.stellwall.api.Visibility
import app.stellwall.start.StartModel
import app.stellwall.start.StartScreen
import app.stellwall.theme.StellwallTheme
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.swipeLeft
import com.github.takahirom.roborazzi.captureRoboImage
import java.time.LocalDate
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** A small family list with something from Sam that is still new. */
class SampleShopping : ShoppingApi {
    val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
    private val sam = Member("sam", "sam", "Sam", "member", "person-lilac", "flieder")
    private fun item(id: String, name: String, qty: String, cat: String, by: String = "me", checked: Boolean = false) =
        Item(id, "l1", name, qty, cat, by, "2026-11-27T10:00:00.000Z", if (checked) "2026-11-27T11:00:00.000Z" else null, if (checked) "sam" else null)
    var items = listOf(
        item("a", "Äpfel", "1 kg", "Obst & Gemüse", by = "sam"),
        item("b", "Bananen", "", "Obst & Gemüse"),
        item("c", "Milch", "2 l", "Kühlregal"),
        item("d", "Brot", "", "Backwaren", checked = true),
    )
    override suspend fun members() = listOf(me, sam)
    override suspend fun board() = listOf<BoardRow>(
        BoardRow.Shopping("sam", "Sam", "l1", "Einkauf", 1, "2026-11-27T10:02:00.000Z", listOf("a")),
        BoardRow.Todo("sam", "Sam", "t1", "Müll rausbringen", "2026-11-27T10:03:00.000Z"),
    )
    override suspend fun boardSeen() {}
    override suspend fun lists() = listOf(ShoppingList("l1", "Einkauf", Visibility(true, emptyList()), "me", 3), ShoppingList("l2", "Drogerie", Visibility(false, listOf("me")), "me", 0))
    override suspend fun createList(name: String, visibility: Visibility) = lists()[0]
    override suspend fun updateList(id: String, name: String?, visibility: Visibility?) = lists()[0]
    override suspend fun deleteList(id: String) {}
    override suspend fun clearList(id: String) {}
    override suspend fun items(listId: String) = if (listId == "l1") items else emptyList()
    override suspend fun addItem(listId: String, name: String, quantity: String, category: String?) = items[0]
    override suspend fun updateItem(id: String, change: ItemChange): Item {
        items = items.map { if (it.id == id) it.copy(checkedAt = if (change.checked == true) "2026-11-27T12:00:00.000Z" else null, checkedBy = "me") else it }
        return items.first { it.id == id }
    }
    val deleted = mutableListOf<String>()
    override suspend fun deleteItem(id: String) { deleted += id; items = items.filter { it.id != id } }
    override suspend fun suggestions(q: String) = listOf(Suggestion("Milch", "Kühlregal"))
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h780dp-xxhdpi")
class ShoppingScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun `grouped by store section, new from Sam marked, ticking moves it down`() {
        val api = SampleShopping()
        compose.setContent { StellwallTheme(world = "salbei", dark = false) { ShoppingScreen(ShoppingModel(api, api.me)) } }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Obst & Gemüse")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("von Sam").assertExists()
        compose.onNodeWithText("Sehen: Alle").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/shopping.png")
        compose.onNodeWithContentDescription("Milch abhaken").assertIsOff().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Milch wieder offen")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Milch wieder offen").assertIsOn()
        compose.onNodeWithText("Heute abgehakt").assertExists()
    }

    @Test fun `a new name asks how many and where it belongs, no amount field beside the search`() {
        val api = SampleShopping()
        compose.setContent { StellwallTheme(world = "salbei", dark = false) { ShoppingScreen(ShoppingModel(api, api.me)) } }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Obst & Gemüse")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(ShopText.QUANTITY).assertDoesNotExist()
        compose.onNode(androidx.compose.ui.test.hasContentDescription(ShopText.ADD)).performTextInput("Schinkenwurst")
        compose.onNode(androidx.compose.ui.test.hasContentDescription(ShopText.ADD)).performImeAction()
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText(ShopText.HOW_MANY)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(ShopText.SECTION_FOR).assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/shopping-amount.png")
    }

    @Test fun `a row swiped right is ticked off, swiped left deleted`() {
        val api = SampleShopping()
        compose.setContent { StellwallTheme(world = "salbei", dark = false) { ShoppingScreen(ShoppingModel(api, api.me)) } }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Bananen")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Bananen").performTouchInput { swipeRight() }
        compose.waitUntil(5_000) { api.items.first { it.name == "Bananen" }.checkedAt != null }
        compose.onNodeWithText("Milch").performTouchInput { swipeLeft() }
        compose.waitUntil(5_000) { api.deleted.isNotEmpty() }
    }

    @Test fun `start shows the board and the areas`() {
        val api = SampleShopping()
        compose.setContent {
            StellwallTheme(world = "salbei", dark = true) {
                StartScreen(api.me, StartModel(board = { api.board() }), today = LocalDate.of(2026, 11, 27), hour = 9) {}
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Sam hat dir „Müll rausbringen“ gegeben")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("2 neu").assertExists()
        compose.onNodeWithText("Dokumente").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/start-dark.png")
    }

    private fun pink(dark: Boolean, file: String) {
        val api = SampleShopping()
        compose.setContent {
            StellwallTheme(world = "pink", dark = dark) {
                StartScreen(api.me, StartModel(board = { api.board() }), today = LocalDate.of(2026, 11, 27), hour = 9) {}
            }
        }
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("2 neu")).fetchSemanticsNodes().isNotEmpty() }
        compose.onRoot().captureRoboImage(file)
    }

    @Test fun `the pink world, light`() = pink(false, "src/test/screenshots/start-pink.png")

    @Test fun `the pink world, dark`() = pink(true, "src/test/screenshots/start-pink-dark.png")
}
