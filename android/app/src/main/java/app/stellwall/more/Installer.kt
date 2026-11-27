package app.stellwall.more

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import app.stellwall.api.AccountApi
import java.io.File
import kotlinx.coroutines.CancellationException

/** Loads the newer APK from the family's server and hands it to Android's installer. */
object Installer {
    /** Null when Android now asks to install; otherwise the text to show. */
    suspend fun update(context: Context, api: AccountApi): String? {
        if (!context.packageManager.canRequestPackageInstalls()) {
            // Android asks once whether Stellwall may install updates.
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return MoreText.ALLOW_INSTALL
        }
        val file = File(context.cacheDir, "updates/stellwall.apk")
        return try {
            api.downloadApk(file)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
            context.startActivity(
                Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            null
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            MoreText.UPDATE_FAILED
        }
    }
}
