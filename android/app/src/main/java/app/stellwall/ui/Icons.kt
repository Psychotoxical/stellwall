package app.stellwall.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import app.stellwall.R
import app.stellwall.Tab

/** Solar Bold Duotone icons, the same set as the web app (converted by scripts/solar-to-android.mjs). */
object Icons {
    @Composable
    fun forTab(t: Tab): ImageVector = ImageVector.vectorResource(
        when (t) {
            Tab.Start -> R.drawable.ic_home_smile
            Tab.Einkauf -> R.drawable.ic_cart_large_2
            Tab.Kalender -> R.drawable.ic_calendar
            Tab.Essen -> R.drawable.ic_chef_hat_minimalistic
            Tab.Todos -> R.drawable.ic_checklist_minimalistic
        },
    )
}
