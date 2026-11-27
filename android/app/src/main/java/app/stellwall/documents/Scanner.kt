package app.stellwall.documents

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.ui.platform.LocalContext
import app.stellwall.api.DocumentFile
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

/** A picked or scanned file, or the note that it is over 30 MB. */
sealed interface Picked {
    class File(val file: DocumentFile) : Picked
    data object TooLarge : Picked
}

/** Reads a picked or scanned file; null when it is gone or may not be read. Call it off the main thread. */
fun readFile(context: Context, uri: Uri, fallbackName: String): Picked? = runCatching { read(context, uri, fallbackName) }.getOrNull()

private fun read(context: Context, uri: Uri, fallbackName: String): Picked? {
    val cr = context.contentResolver
    var name = fallbackName
    var size = -1L
    cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            c.getString(0)?.let { name = it }
            if (!c.isNull(1)) size = c.getLong(1)
        }
    }
    if (size > MAX_BYTES) return Picked.TooLarge
    // Reads at most one byte over the limit, so a huge file never fills the memory.
    val bytes = cr.openInputStream(uri)?.use { input ->
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        while (out.size() <= MAX_BYTES) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
        }
        out.toByteArray()
    } ?: return null
    if (bytes.size > MAX_BYTES) return Picked.TooLarge
    return Picked.File(DocumentFile(name, cr.getType(uri) ?: "application/octet-stream", bytes))
}

/** "Hausrat_2026.pdf" → "Hausrat 2026", as in the web app. */
fun nameFromFile(file: String) = file.replace(Regex("\\.[^.]{1,5}$"), "").replace('_', ' ').trim().take(120)

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

class DocumentSources(val scan: (() -> Unit)?, val pick: () -> Unit)

/**
 * Google's document scanner (edges found by itself, up to 20 pages as one PDF, photos from the
 * gallery allowed) and the system file picker. [onFile] gets null when nothing was chosen.
 */
@Composable
fun rememberDocumentSources(onFile: (Picked?) -> Unit, onScanUnavailable: () -> Unit): DocumentSources {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // A large file from a cloud folder takes a while: read it away from the screen's thread.
    val load = { uri: Uri?, name: String ->
        if (uri == null) onFile(null)
        else scope.launch { onFile(withContext(Dispatchers.IO) { readFile(context, uri, name) }) }
    }
    // Made on the first tap: ML Kit is not there in tests and on phones without Google Play.
    val scanner = remember {
        lazy {
            GmsDocumentScanning.getClient(
            GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(20)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build(),
            )
        }
    }
    val scanned = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        val pdf = if (r.resultCode == Activity.RESULT_OK) GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pdf else null
        load(pdf?.uri, "Scan.pdf")
    }
    val picked = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        load(uri, "Dokument")
    }
    val activity = context.activity()
    return DocumentSources(
        scan = activity?.let { a ->
            {
                runCatching { scanner.value.getStartScanIntent(a) }
                    .onFailure { onScanUnavailable() }
                    .getOrNull()
                    ?.addOnSuccessListener { scanned.launch(IntentSenderRequest.Builder(it).build()) }
                    ?.addOnFailureListener { onScanUnavailable() }
            }
        },
        pick = { picked.launch(arrayOf("application/pdf", "image/jpeg", "image/png")) },
    )
}
