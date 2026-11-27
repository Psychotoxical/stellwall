package app.stellwall.api

import java.io.File
import kotlinx.serialization.Serializable

/** Changes to one's own profile; only what is set is sent. */
@Serializable
data class MemberChange(val displayName: String? = null, val color: String? = null, val world: String? = null)

@Serializable
internal data class PasswordChange(val current: String, val next: String)

@Serializable
data class PushDevice(val id: String, val label: String, val createdAt: String)

@Serializable
internal data class FcmRegistration(val token: String, val label: String)

@Serializable
internal data class DeviceCount(val devices: Int)

@Serializable
internal data class LogoutBody(val pushEndpoint: String? = null)

@Serializable
data class AppVersion(val versionCode: Int, val versionName: String)

/** Whether the server can reach phones, and the newest app it has. */
@Serializable
data class AppInfo(val fcm: Boolean, val android: AppVersion?)

/** One's own account, notifications on this phone, and the app's own updates. */
interface AccountApi {
    suspend fun updateMember(id: String, change: MemberChange): Member
    suspend fun changePassword(current: String, next: String)
    suspend fun notificationPrefs(): Map<String, Boolean>
    suspend fun setNotificationPref(kind: String, on: Boolean)
    suspend fun pushDevices(): List<PushDevice>
    suspend fun deletePushDevice(id: String)
    suspend fun registerFcm(token: String, label: String)
    suspend fun pushTest(): Int
    suspend fun appInfo(): AppInfo
    suspend fun downloadApk(to: File)
}
