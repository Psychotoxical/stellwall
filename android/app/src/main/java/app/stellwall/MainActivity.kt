package app.stellwall

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Root((application as StellwallApp).model, dark = isSystemInDarkTheme())
        }
        link(intent)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        link(intent)
    }

    private fun link(intent: android.content.Intent?) {
        intent?.getStringExtra(app.stellwall.push.Push.EXTRA_URL)?.let { (application as StellwallApp).links.value = it }
    }
}
