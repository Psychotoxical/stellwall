package app.stellwall.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.stellwall.api.CookieStore
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The server address, in plain app settings. */
class DevicePrefs(context: Context) : Prefs {
    private val prefs = context.getSharedPreferences("stellwall", Context.MODE_PRIVATE)
    override var server: String?
        get() = prefs.getString("server", null)
        set(value) = prefs.edit().putString("server", value).apply()
}

/**
 * The session cookie, encrypted with a key that never leaves the Android Keystore.
 * If the key is lost (app data restored elsewhere), the cookie reads as absent and the person signs in again.
 */
class KeystoreCookieStore(context: Context) : CookieStore {
    private val prefs = context.getSharedPreferences("stellwall-session", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    override fun read(): String? {
        val stored = prefs.getString("cookies", null) ?: return null
        return runCatching {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV))
            String(cipher.doFinal(bytes, IV, bytes.size - IV), Charsets.UTF_8)
        }.getOrNull()
    }

    override fun write(value: String?) {
        if (value == null) {
            prefs.edit().remove("cookies").apply()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val out = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit().putString("cookies", Base64.encodeToString(out, Base64.NO_WRAP)).apply()
    }

    private companion object {
        const val ALIAS = "stellwall-session"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV = 12
    }
}
