package app.stellwall

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.api.ApiClient
import app.stellwall.session.AppModel
import app.stellwall.session.AppState
import app.stellwall.session.LoginScreen
import app.stellwall.session.LoginText
import app.stellwall.theme.LocalPalette
import app.stellwall.theme.StellwallTheme
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch

/** Sign-in first, then the app in the member's own colour world. */
@Composable
fun Root(model: AppModel<ApiClient>, dark: Boolean) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { if (state == AppState.Loading) model.start() }
    val world = (state as? AppState.SignedIn)?.member?.world ?: "flieder"
    StellwallTheme(world = world, dark = dark) {
        when (val s = state) {
            AppState.Loading -> Splash()
            AppState.Unreachable -> Unreachable(onRetry = { scope.launch { model.start() } })
            is AppState.SignedOut -> LoginScreen(server = s.server, onSubmit = model::signIn)
            is AppState.SignedIn -> {
                val api = model.backend
                val live = remember(api) { api?.live() ?: emptyFlow() }
                AppShell(member = s.member, api = api, calendarApi = api, live = live, webUrl = model.server)
            }
        }
    }
}

@Composable
private fun Splash() {
    Column(Modifier.fillMaxSize().background(LocalPalette.current.ground), Arrangement.Center, Alignment.CenterHorizontally) { Wordmark(size = 40) }
}

@Composable
private fun Unreachable(onRetry: () -> Unit) {
    val p = LocalPalette.current
    Column(
        Modifier.fillMaxSize().background(p.ground).safeDrawingPadding().padding(24.dp),
        Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        Alignment.CenterHorizontally,
    ) {
        Wordmark(size = 40)
        Text(LoginText.UNREACHABLE, style = MaterialTheme.typography.bodyLarge, color = p.ink, textAlign = TextAlign.Center)
        Button(
            onClick = onRetry, modifier = Modifier.heightIn(min = 52.dp), shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = p.primary, contentColor = p.primaryInk),
        ) { Text("Nochmal versuchen", style = MaterialTheme.typography.titleMedium) }
    }
}
