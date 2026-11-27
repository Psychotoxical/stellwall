package app.stellwall.more

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.stellwall.BuildConfig
import app.stellwall.api.AccountApi
import app.stellwall.api.AppInfo
import app.stellwall.api.Member
import app.stellwall.push.Push
import app.stellwall.push.TokenStore
import app.stellwall.theme.LocalPalette
import app.stellwall.theme.WORLDS
import app.stellwall.ui.BackLink
import app.stellwall.ui.BoxCard
import app.stellwall.ui.GhostButton
import app.stellwall.ui.Icons
import app.stellwall.ui.Notice
import app.stellwall.ui.PageHead
import app.stellwall.ui.PersonColors
import app.stellwall.ui.PrimaryButton
import app.stellwall.ui.RadiusSm
import app.stellwall.ui.RowDivider
import app.stellwall.ui.SectionHead
import app.stellwall.ui.fieldColors
import kotlinx.coroutines.launch

/** How this phone is named in "Deine Geräte". */
fun deviceLabel() = "Android · ${Build.MODEL}"

@Composable
fun UpdateBanner(api: AccountApi, info: AppInfo?) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    val v = info?.android ?: return
    if (!Updates.newer(info, BuildConfig.VERSION_CODE)) return
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.changeSoft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(MoreText.UPDATE, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink)
        PrimaryButton(if (busy) MoreText.UPDATING else MoreText.updateTo(v.versionName), {
            busy = true
            scope.launch { note = Installer.update(context, api); busy = false }
        }, Modifier.fillMaxWidth(), enabled = !busy)
        note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = p.ink) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MoreScreen(
    api: AccountApi,
    member: Member,
    info: AppInfo?,
    webUrl: String?,
    onMemberChanged: (Member) -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val account = remember(member.id) { AccountModel(api, member, onMemberChanged) }
    val notify = remember { NotifyModel(api) }
    val n by notify.state.collectAsStateWithLifecycle()
    LaunchedEffect(notify) { notify.load() }

    var name by remember { mutableStateOf(member.displayName) }
    var color by remember { mutableStateOf(member.color) }
    var world by remember { mutableStateOf(member.world) }
    var profileNote by remember { mutableStateOf<String?>(null) }
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var passwordNote by remember { mutableStateOf<String?>(null) }
    var testNote by remember { mutableStateOf<String?>(null) }
    var allowed by remember { mutableStateOf(Push.allowed(context)) }
    var denied by remember { mutableStateOf(false) }

    val register = {
        scope.launch {
            Push.token()?.let { t ->
                TokenStore(context).token = t
                notify.register(t, deviceLabel())
            }
        }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        allowed = ok
        denied = !ok
        if (ok) register()
    }

    Column(Modifier.fillMaxSize().background(p.ground).verticalScroll(rememberScrollState()).padding(16.dp)) {
        BackLink("Start", onBack)
        PageHead(MoreText.PAGE)
        UpdateBanner(api, info)

        SectionHead(MoreText.PROFILE)
        BoxCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(name, { name = it.take(60) }, Modifier.fillMaxWidth(), label = { Text(MoreText.NAME) }, singleLine = true, colors = fieldColors())
                Text(MoreText.COLOR, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    for (c in MoreText.COLORS) {
                        val on = c == color
                        Box(
                            Modifier.size(48.dp).clip(CircleShape).background(PersonColors.of(c)).border(if (on) 3.dp else 0.dp, p.ink, CircleShape)
                                .selectable(selected = on, role = Role.RadioButton) { color = c }.semantics { contentDescription = c.removePrefix("person-") },
                        )
                    }
                }
                Text(MoreText.COLOR_HINT, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                Text(MoreText.WORLD, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((key, label) in MoreText.WORLDS) {
                        val on = key == world
                        val wp = WORLDS.getValue(key).light
                        Row(
                            Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(50)).background(wp.field).border(if (on) 2.dp else 1.dp, if (on) wp.primary else wp.rule, RoundedCornerShape(50))
                                .selectable(selected = on, role = Role.RadioButton) { world = key }.padding(horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(Modifier.size(18.dp).clip(CircleShape).background(wp.primary))
                            Text(label, style = MaterialTheme.typography.labelLarge, color = wp.ink)
                        }
                    }
                }
                Text(MoreText.WORLD_HINT, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                profileNote?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = p.ink) }
                PrimaryButton(MoreText.SAVE, { scope.launch { profileNote = account.saveProfile(name, color, world) ?: MoreText.SAVED } }, Modifier.fillMaxWidth())
            }
        }

        SectionHead(MoreText.PASSWORD)
        BoxCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(current, { current = it }, Modifier.fillMaxWidth(), label = { Text(MoreText.CURRENT) }, singleLine = true, colors = fieldColors(), visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                OutlinedTextField(next, { next = it }, Modifier.fillMaxWidth(), label = { Text(MoreText.NEW) }, singleLine = true, colors = fieldColors(), visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), supportingText = { Text(MoreText.HINT, color = p.inkSoft) })
                passwordNote?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = p.ink) }
                PrimaryButton(MoreText.PASSWORD, {
                    scope.launch {
                        val e = account.changePassword(current, next)
                        passwordNote = e ?: MoreText.CHANGED
                        if (e == null) { current = ""; next = "" }
                    }
                }, Modifier.fillMaxWidth(), enabled = current.isNotEmpty() && next.isNotEmpty())
            }
        }

        SectionHead(MoreText.NOTIFY)
        BoxCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(MoreText.STEP1, style = MaterialTheme.typography.labelLarge, color = p.inkSoft)
                when {
                    !Push.available -> Text(MoreText.NO_BUILD, style = MaterialTheme.typography.bodyLarge, color = p.ink)
                    info?.fcm == false -> Text(MoreText.NO_FCM, style = MaterialTheme.typography.bodyLarge, color = p.ink)
                    allowed && n.devices.any { it.label == deviceLabel() } -> Text(MoreText.ON, style = MaterialTheme.typography.bodyLarge, color = p.ink)
                    denied -> {
                        Notice(MoreText.DENIED)
                        GhostButton(MoreText.OPEN_SETTINGS, {
                            context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }, Modifier.fillMaxWidth())
                    }
                    else -> PrimaryButton(MoreText.ALLOW, {
                        if (Build.VERSION.SDK_INT >= 33 && !allowed) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else register()
                    }, Modifier.fillMaxWidth())
                }
                Text(MoreText.STEP2, style = MaterialTheme.typography.labelLarge, color = p.inkSoft, modifier = Modifier.padding(top = 6.dp))
                for ((kind, label) in MoreText.KINDS) {
                    val on = n.prefs[kind] ?: true
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(value = on, role = Role.Switch) { scope.launch { notify.set(kind, it) } },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.weight(1f))
                        Switch(checked = on, onCheckedChange = null, colors = SwitchDefaults.colors(checkedTrackColor = p.primary, checkedThumbColor = p.primaryInk))
                    }
                }
                Text(MoreText.QUIET, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
                Text(MoreText.STEP3, style = MaterialTheme.typography.labelLarge, color = p.inkSoft, modifier = Modifier.padding(top = 6.dp))
                GhostButton(MoreText.TEST, { scope.launch { testNote = notify.test() } }, Modifier.fillMaxWidth())
                testNote?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = p.ink) }
                n.error?.let { Notice(it) }
                Text(MoreText.DEVICES, style = MaterialTheme.typography.labelLarge, color = p.inkSoft, modifier = Modifier.padding(top = 6.dp))
                if (n.devices.isEmpty()) Text(MoreText.NO_DEVICES, style = MaterialTheme.typography.bodyLarge, color = p.inkSoft)
                for (d in n.devices) {
                    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(d.label.ifBlank { "?" }, style = MaterialTheme.typography.bodyLarge, color = p.ink, modifier = Modifier.weight(1f))
                        Box(
                            Modifier.size(48.dp).clickable(role = Role.Button) { scope.launch { notify.remove(d) } }.semantics { contentDescription = MoreText.remove(d.label) },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.vector(Icons.TRASH), contentDescription = null, tint = p.inkSoft, modifier = Modifier.size(22.dp)) }
                    }
                }
            }
        }

        if (member.role == "admin" && webUrl != null) {
            SectionHead(MoreText.ADMIN)
            BoxCard {
                listOf(MoreText.MEMBERS to "/mitglieder", MoreText.MEALIE to "/mealie", MoreText.IMPORT to "/kalender/import").forEachIndexed { i, (label, path) ->
                    if (i > 0) RowDivider()
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) { uri.openUri(webUrl.trimEnd('/') + path) }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = p.ink, modifier = Modifier.weight(1f))
                        Text("↗", color = p.inkSoft)
                    }
                }
            }
        }

        SectionHead(MoreText.ABOUT)
        BoxCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(MoreText.version(BuildConfig.VERSION_NAME), style = MaterialTheme.typography.labelLarge, color = p.ink)
                Text(MoreText.LICENSES, style = MaterialTheme.typography.bodySmall, color = p.inkSoft)
            }
        }
        GhostButton(MoreText.LOGOUT, onSignOut, Modifier.fillMaxWidth().padding(top = 18.dp), danger = true)
    }
}
