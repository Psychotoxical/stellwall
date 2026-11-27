package app.stellwall.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.stellwall.BuildConfig
import app.stellwall.MainActivity
import app.stellwall.R
import app.stellwall.more.MoreText
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** Push on this phone: Firebase set up from the build's values, one channel per kind of message. */
object Push {
    const val EXTRA_URL = "stellwall.url"
    private val ids = NotificationIds()

    /** False when this build was made without google-services.json. */
    val available: Boolean get() = BuildConfig.FCM_APP_ID.isNotEmpty()

    fun init(context: Context) {
        channels(context)
        if (!available || FirebaseApp.getApps(context).isNotEmpty()) return
        FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FCM_APP_ID)
                .setApiKey(BuildConfig.FCM_API_KEY)
                .setProjectId(BuildConfig.FCM_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                .build(),
        )
    }

    fun allowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** This phone's FCM token, or null when push is not set up or Google cannot be reached. */
    suspend fun token(): String? {
        if (!available) return null
        return suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { t -> cont.resume(if (t.isSuccessful) t.result else null) }
        }
    }

    /** The endpoint the server keeps for this phone ("fcm:<token>"), for signing out. */
    fun endpoint(context: Context): String? = TokenStore(context).token?.let { "fcm:$it" }

    private fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        for ((kind, label) in MoreText.KINDS + ("test" to MoreText.TEST)) {
            nm.createNotificationChannel(NotificationChannel(kind, label, NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    fun show(context: Context, data: Map<String, String>) {
        if (!allowed(context)) return
        val kind = data["kind"]?.takeIf { k -> k == "test" || MoreText.KINDS.any { it.first == k } } ?: "event"
        val url = data["url"] ?: "/"
        val open = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_URL, url)
        }
        // Each message its own id: two of the same kind (two to-dos, two birthdays) both stay.
        val id = ids.next()
        val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(context, kind)
            .setSmallIcon(R.drawable.ic_bell)
            .setContentTitle(data["title"] ?: "Stellwall")
            .setContentText(data["body"].orEmpty())
            .setStyle(NotificationCompat.BigTextStyle().bigText(data["body"].orEmpty()))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context).notify(id, n)
    }
}

/** The last token Firebase gave this phone. */
class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("stellwall-push", Context.MODE_PRIVATE)
    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().putString("token", v).apply()
}

class StellwallMessaging : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) = Push.show(this, message.data)

    /** A new token is sent to the server the next time the app is opened while signed in. */
    override fun onNewToken(token: String) {
        TokenStore(this).token = token
    }
}

/** Ids for notifications, different for every message in this process. */
class NotificationIds {
    private val next = java.util.concurrent.atomic.AtomicInteger((System.currentTimeMillis() / 1000 % 1_000_000).toInt())
    fun next(): Int = next.incrementAndGet()
}
