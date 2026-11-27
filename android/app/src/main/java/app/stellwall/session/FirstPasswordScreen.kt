package app.stellwall.session

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.stellwall.Wordmark
import app.stellwall.more.MoreText
import app.stellwall.theme.LocalPalette
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Notice
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.fieldColors
import kotlinx.coroutines.launch

object FirstPasswordText {
    fun title(name: String) = "Hallo $name, bitte ein eigenes Passwort"
    const val LEAD = "Dein Passwort hat die Verwaltung vergeben. Wähle jetzt eins, das nur du kennst."
    const val CURRENT = "Passwort von der Verwaltung"
    const val SUBMIT = "Passwort speichern"
}

/**
 * After the first sign-in with a password the administration chose, the member picks an own one.
 * The password just typed at sign-in is used when this device still knows it.
 */
@Composable
fun FirstPasswordScreen(name: String, known: String?, onSubmit: suspend (current: String, next: String) -> String?, onSignOut: () -> Unit) {
    val p = LocalPalette.current
    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val ready = (known != null || current.isNotEmpty()) && next.isNotEmpty() && !busy
    val submit = {
        if (ready) {
            focus.clearFocus()
            scope.launch {
                busy = true
                error = onSubmit(known ?: current, next)
                busy = false
            }
        }
    }
    Column(
        Modifier.fillMaxSize().background(p.ground).safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Wordmark(size = 40)
            Text(FirstPasswordText.title(name), style = MaterialTheme.typography.headlineMedium, color = p.ink)
            Text(FirstPasswordText.LEAD, style = MaterialTheme.typography.bodyLarge, color = p.ink)
            if (known == null) {
                OutlinedTextField(
                    current, { current = it }, Modifier.fillMaxWidth(), label = { Text(FirstPasswordText.CURRENT) }, singleLine = true, colors = fieldColors(),
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                )
            }
            OutlinedTextField(
                next, { next = it }, Modifier.fillMaxWidth(), label = { Text(MoreText.NEW) }, singleLine = true, colors = fieldColors(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                supportingText = { Text(MoreText.HINT, color = p.inkSoft) },
            )
            error?.let { Notice(it) }
            PrimaryButton(FirstPasswordText.SUBMIT, { submit() }, Modifier.fillMaxWidth(), enabled = ready)
            GhostButton(MoreText.LOGOUT, onSignOut, Modifier.fillMaxWidth())
        }
    }
}
