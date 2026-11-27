package app.stellwall.session

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.stellwall.Wordmark
import app.stellwall.ui.Notice
import app.stellwall.theme.LocalPalette
import kotlinx.coroutines.launch

/** "wall.example.org" instead of "https://wall.example.org/", as people type it. */
private fun shown(server: String?) = server.orEmpty().removePrefix("https://").removeSuffix("/")

@Composable
fun LoginScreen(server: String?, onSubmit: suspend (server: String, username: String, password: String) -> String?) {
    val p = LocalPalette.current
    var address by rememberSaveable { mutableStateOf(shown(server)) }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ready = address.isNotBlank() && username.isNotBlank() && password.isNotEmpty() && !busy
    val focus = LocalFocusManager.current
    val submit = {
        if (ready) {
            // The keyboard goes away, so the answer below the fields is not hidden behind it.
            focus.clearFocus()
            scope.launch {
                busy = true
                error = null
                error = onSubmit(address, username, password)
                busy = false
            }
        }
    }
    val colors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = p.surface, unfocusedContainerColor = p.surface,
        focusedBorderColor = p.primary, unfocusedBorderColor = p.rule,
        focusedLabelColor = p.primary, unfocusedLabelColor = p.inkSoft,
        focusedTextColor = p.ink, unfocusedTextColor = p.ink, cursorColor = p.primary,
    )
    val field = Modifier.fillMaxWidth()

    Column(
        Modifier.fillMaxSize().background(p.ground).safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Wordmark(size = 40)
            Text(LoginText.TITLE, style = MaterialTheme.typography.headlineMedium, color = p.ink, modifier = Modifier.padding(bottom = 6.dp))
            OutlinedTextField(
                address, { address = it }, field, label = { Text(LoginText.SERVER) }, singleLine = true, colors = colors,
                placeholder = { Text("wall.example.org") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Next),
            )
            OutlinedTextField(
                username, { username = it }, field, label = { Text(LoginText.USERNAME) }, singleLine = true, colors = colors,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next),
            )
            OutlinedTextField(
                password, { password = it }, field, label = { Text(LoginText.PASSWORD) }, singleLine = true, colors = colors,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            error?.let { Notice(it) }
            Button(
                onClick = { submit() }, enabled = ready, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = p.primary, contentColor = p.primaryInk),
            ) { Text(LoginText.SUBMIT, style = MaterialTheme.typography.titleMedium) }
        }
    }
}
