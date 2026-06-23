package com.vairiot.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.vairiot.app.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "UpdateChecker"

@Singleton
class UpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: UpdateApi,
) {
    /**
     * Returns true if an update was downloaded and the install intent fired.
     */
    suspend fun checkAndInstall(): Boolean = withContext(Dispatchers.IO) {
        val info = try { api.checkVersion() } catch (e: Exception) {
            Log.w(TAG, "version check failed: ${e.message}")
            return@withContext false
        }
        if (!info.available || info.versionCode == null) {
            Log.i(TAG, "no update available")
            return@withContext false
        }
        if (info.versionCode <= BuildConfig.VERSION_CODE) {
            Log.i(TAG, "already on or ahead of latest (have=${BuildConfig.VERSION_CODE}, latest=${info.versionCode})")
            return@withContext false
        }

        // Idempotency guard: if we've already fired the install prompt for this
        // exact (versionCode, sha256) in a previous process and the device is
        // still behind, the upload's versionCode metadata doesn't match its
        // binary — installing again would loop forever. Force-stop + relaunch
        // bypasses by clearing the key below.
        val prefs    = context.getSharedPreferences("vairiot.update", Context.MODE_PRIVATE)
        val promptKey = "${info.versionCode}:${info.sha256 ?: ""}"
        if (prefs.getString("lastPromptedKey", null) == promptKey) {
            Log.w(TAG, "already prompted for $promptKey but device is still behind — skipping to break loop")
            return@withContext false
        }

        Log.i(TAG, "update available: ${info.versionName} (code ${info.versionCode}); downloading…")
        val apk = downloadToCache(info) ?: return@withContext false

        if (info.sha256 != null) {
            val gotHash = sha256(apk)
            if (!gotHash.equals(info.sha256, ignoreCase = true)) {
                Log.w(TAG, "sha256 mismatch — expected=${info.sha256} got=$gotHash; deleting")
                apk.delete()
                return@withContext false
            }
        }

        prefs.edit().putString("lastPromptedKey", promptKey).apply()
        promptInstall(apk)
        true
    }

    private suspend fun downloadToCache(info: MobileVersionResponse): File? = withContext(Dispatchers.IO) {
        try {
            val body = api.downloadApk()
            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
            // Clean older APKs first
            updatesDir.listFiles()?.forEach { it.delete() }
            val out = File(updatesDir, "vairiot-${info.versionCode}.apk")
            body.byteStream().use { input ->
                FileOutputStream(out).use { fos -> input.copyTo(fos) }
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "download failed: ${e.message}")
            null
        }
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { fis ->
            val buf = ByteArray(8192)
            while (true) {
                val n = fis.read(buf)
                if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun promptInstall(apk: File) {
        val authority = "${context.packageName}.fileprovider"
        val uri: Uri = FileProvider.getUriForFile(context, authority, apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        context.startActivity(intent)
    }
}
