package app.stellwall.theme

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Light or dark as the system has it, or fixed; the same three choices as in the web app. */
object ThemeChoice {
    const val SYSTEM = "system"
    const val LIGHT = "light"
    const val DARK = "dark"
    val ALL = listOf(SYSTEM to "Wie das System", LIGHT to "Hell", DARK to "Dunkel")

    fun dark(choice: String, systemDark: Boolean) = when (choice) {
        LIGHT -> false
        DARK -> true
        else -> systemDark
    }
}

/** The choice for this device, kept in the app settings. */
class ThemeStore(context: Context) {
    private val prefs = context.getSharedPreferences("stellwall", Context.MODE_PRIVATE)
    private val _choice = MutableStateFlow(prefs.getString("theme", null) ?: ThemeChoice.SYSTEM)
    val choice: StateFlow<String> = _choice

    fun set(choice: String) {
        prefs.edit().putString("theme", choice).apply()
        _choice.value = choice
    }
}
