package app.stellwall.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import app.stellwall.R
import app.stellwall.Tab

/** Solar Bold Duotone icons, the same set as the web app (converted by scripts/solar-to-android.mjs). */
object Icons {
    val CART = R.drawable.ic_cart_large_2
    val TODOS = R.drawable.ic_checklist_minimalistic
    val CALENDAR = R.drawable.ic_calendar
    val CAKE = R.drawable.ic_cake
    val DOCUMENTS = R.drawable.ic_document_text
    val MEALS = R.drawable.ic_chef_hat_minimalistic
    val MEMBERS = R.drawable.ic_users_group_rounded
    val TRASH = R.drawable.ic_trash_bin_minimalistic

    @Composable
    fun vector(id: Int): ImageVector = ImageVector.vectorResource(id)

    @Composable
    fun forTab(t: Tab): ImageVector = vector(
        when (t) {
            Tab.Start -> R.drawable.ic_home_smile
            Tab.Einkauf -> CART
            Tab.Kalender -> CALENDAR
            Tab.Essen -> MEALS
            Tab.Todos -> TODOS
        },
    )
}
