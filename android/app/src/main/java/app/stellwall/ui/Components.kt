package app.stellwall.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.stellwall.theme.LocalPalette
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import kotlinx.coroutines.launch

val RadiusMd = RoundedCornerShape(16.dp)
val RadiusSm = RoundedCornerShape(12.dp)

@Composable
fun fieldColors(): TextFieldColors {
    val p = LocalPalette.current
    return OutlinedTextFieldDefaults.colors(
        focusedContainerColor = p.surface, unfocusedContainerColor = p.surface,
        focusedBorderColor = p.primary, unfocusedBorderColor = p.rule,
        focusedLabelColor = p.primary, unfocusedLabelColor = p.inkSoft,
        focusedPlaceholderColor = p.inkSoft, unfocusedPlaceholderColor = p.inkSoft,
        focusedTextColor = p.ink, unfocusedTextColor = p.ink, cursorColor = p.primary,
    )
}

/** Page title with an optional line above it, as the web app's header. */
@Composable
fun PageHead(title: String, sub: String? = null) {
    val p = LocalPalette.current
    Column(Modifier.padding(bottom = 14.dp)) {
        if (sub != null) Text(sub, style = MaterialTheme.typography.bodyMedium, color = p.inkSoft)
        Text(title, style = MaterialTheme.typography.headlineMedium, color = p.ink, modifier = Modifier.semantics { heading() })
    }
}

@Composable
fun SectionHead(title: String, aside: String? = null) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(top = 22.dp, bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = p.ink, modifier = Modifier.semantics { heading() })
        if (aside != null) Text(aside, style = MaterialTheme.typography.bodySmall, color = p.inkSoft, modifier = Modifier.padding(start = 12.dp))
    }
}

/** A card with rows separated by thin lines. */
@Composable
fun BoxCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    Column(modifier.fillMaxWidth().clip(RadiusMd).background(p.surface).border(1.dp, p.rule, RadiusMd), content = content)
}

@Composable
fun RowDivider() = HorizontalDivider(color = LocalPalette.current.rule, thickness = 1.dp)

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val p = LocalPalette.current
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 52.dp), shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = p.primary, contentColor = p.primaryInk),
    ) { Text(text, style = MaterialTheme.typography.titleMedium) }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, danger: Boolean = false) {
    val p = LocalPalette.current
    OutlinedButton(
        onClick = onClick, modifier = modifier.heightIn(min = 52.dp), shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.5.dp, if (danger) p.changeInk else p.rule),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = p.ink, containerColor = if (danger) p.changeSoft else p.surface),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun LinkButton(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) { Text(text, style = MaterialTheme.typography.labelLarge, color = LocalPalette.current.ink) }
}

/** A bottom sheet with a title; its content scrolls and stays above the keyboard. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Sheet(title: String, onClose: () -> Unit, footer: (@Composable ColumnScope.() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = p.ground) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Column(
                Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = if (footer == null) 20.dp else 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(title, style = MaterialTheme.typography.titleLarge, color = p.ink, modifier = Modifier.semantics { heading() })
                content()
            }
            // Save and cancel stay at the bottom while a long list scrolls above them.
            if (footer != null) {
                androidx.compose.material3.HorizontalDivider(color = p.rule)
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = footer)
            }
        }
    }
}

/** "‹ Kalender": back to the page this one belongs to, as the web app's back links. */
@Composable
fun BackLink(parent: String, onClick: () -> Unit) {
    val p = LocalPalette.current
    TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Zurück zu $parent" }) {
        Text("‹ $parent", style = MaterialTheme.typography.labelLarge, color = p.ink)
    }
}


/** Pull the page down to load it again, as everywhere on Android. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshPage(onRefresh: suspend () -> Unit, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } },
        modifier = Modifier.fillMaxSize(),
    ) { content() }
}

/**
 * Swipe a row: to the right for [onStart] (tick off), to the left for [onEnd] (delete). The row springs
 * back afterwards; the list shows the change. Talkback gets both as actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeRow(
    onStart: (() -> Unit)?, startLabel: String, onEnd: (() -> Unit)? = null, endLabel: String = "",
    content: @Composable () -> Unit,
) {
    val p = LocalPalette.current
    val haptic = LocalHapticFeedback.current
    val state = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        when (v) {
            SwipeToDismissBoxValue.StartToEnd -> onStart?.let { haptic.performHapticFeedback(HapticFeedbackType.LongPress); it() }
            SwipeToDismissBoxValue.EndToStart -> onEnd?.let { haptic.performHapticFeedback(HapticFeedbackType.LongPress); it() }
            SwipeToDismissBoxValue.Settled -> Unit
        }
        false
    })
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = onStart != null,
        enableDismissFromEndToStart = onEnd != null,
        modifier = Modifier.semantics {
            customActions = listOfNotNull(
                onStart?.let { CustomAccessibilityAction(startLabel) { it(); true } },
                onEnd?.let { CustomAccessibilityAction(endLabel) { it(); true } },
            )
        },
        backgroundContent = {
            val toStart = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            val danger = !toStart
            Box(
                Modifier.fillMaxSize().background(if (danger) p.changeSoft else p.field).padding(horizontal = 22.dp),
                contentAlignment = if (toStart) Alignment.CenterStart else Alignment.CenterEnd,
            ) { Text(if (toStart) "✓" else "✕", style = MaterialTheme.typography.titleLarge, color = if (danger) p.changeInk else p.primary) }
        },
    ) { content() }
}
