package app.stellwall.meals

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import app.stellwall.api.ImportImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

/**
 * Google's document scanner for recipe pages: straightened JPEGs, up to four pages, photos from the
 * gallery allowed. Null where there is no activity to start it from (tests).
 */
@Composable
fun rememberRecipeScanner(onPages: (List<ImportImage>) -> Unit, onUnavailable: () -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Made on the first tap: ML Kit is not there in tests and on phones without Google Play.
    val scanner = remember {
        lazy {
            GmsDocumentScanning.getClient(
                GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setPageLimit(4)
                    .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build(),
            )
        }
    }
    val scanned = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        val pages = if (r.resultCode == Activity.RESULT_OK) GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pages.orEmpty() else emptyList()
        if (pages.isNotEmpty()) scope.launch { onPages(withContext(Dispatchers.IO) { pages.mapNotNull { read(context, it.imageUri) } }) }
    }
    val activity = context.activity() ?: return null
    return {
        runCatching { scanner.value.getStartScanIntent(activity) }
            .onFailure { onUnavailable() }
            .getOrNull()
            ?.addOnSuccessListener { scanned.launch(IntentSenderRequest.Builder(it).build()) }
            ?.addOnFailureListener { onUnavailable() }
    }
}

private fun read(context: Context, uri: Uri): ImportImage? =
    context.contentResolver.openInputStream(uri)?.use { ImportImage(Base64.getEncoder().encodeToString(it.readBytes()), "image/jpeg") }
