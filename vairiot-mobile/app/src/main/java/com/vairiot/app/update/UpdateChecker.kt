package com.vairiot.app.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.vairiot.app.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

private const val TAG = "UpdateChecker"
private const val ACTION_INSTALL_STATUS = "com.vairiot.app.INSTALL_STATUS"
private const val PREFS_NAME = "vairiot.update"
private const val KEY_LAST_PROMPTED = "lastPromptedKey"

/** Outcome of a manual "check for updates" request. */
sealed interface UpdateCheckResult {
    /** A newer version is available on the server. */
    data class Available(val info: MobileVersionResponse) : UpdateCheckResult
    /** The device is already on (or ahead of) the latest release. */
    object UpToDate : UpdateCheckResult
    /** The version check could not be completed (offline / server error). */
    object Failed : UpdateCheckResult
}

@Singleton
class UpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: UpdateApi,
) {
    private val prefs get() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun promptKey(info: MobileVersionResponse) = "${info.versionCode}:${info.sha256 ?: ""}"

    /**
     * Queries the server for the latest release without downloading anything.
     * Safe to call from the UI for an explicit "check for updates" action.
     */
    suspend fun checkForUpdate(): UpdateCheckResult = withContext(Dispatchers.IO) {
        val info = try { api.checkVersion() } catch (e: Exception) {
            Log.w(TAG, "version check failed: ${e.message}")
            return@withContext UpdateCheckResult.Failed
        }
        if (!info.available || info.versionCode == null) {
            Log.i(TAG, "no update available")
            return@withContext UpdateCheckResult.UpToDate
        }
        if (info.versionCode <= BuildConfig.VERSION_CODE) {
            Log.i(TAG, "already on or ahead of latest (have=${BuildConfig.VERSION_CODE}, latest=${info.versionCode})")
            return@withContext UpdateCheckResult.UpToDate
        }
        UpdateCheckResult.Available(info)
    }

    /**
     * Forget that we have already prompted for [info], so the next automatic
     * check (e.g. on the next cold-start / sign-in) will download and install it.
     * Used when the user picks "Not now" but we still want the update applied
     * on their next session.
     */
    fun deferToNextSignIn(info: MobileVersionResponse) {
        if (prefs.getString(KEY_LAST_PROMPTED, null) == promptKey(info)) {
            prefs.edit().remove(KEY_LAST_PROMPTED).apply()
        }
        Log.i(TAG, "update ${info.versionName} deferred — will auto-download on next sign in")
    }

    /**
     * Returns true if an update was downloaded and installed successfully.
     * Used by the background worker (cold-start / periodic checks).
     */
    suspend fun checkAndInstall(): Boolean = withContext(Dispatchers.IO) {
        val info = when (val result = checkForUpdate()) {
            is UpdateCheckResult.Available -> result.info
            else -> return@withContext false
        }

        val key = promptKey(info)
        if (prefs.getString(KEY_LAST_PROMPTED, null) == key) {
            Log.w(TAG, "already prompted for $key but device is still behind — skipping to break loop")
            return@withContext false
        }

        downloadAndInstall(info)
    }

    /**
     * Downloads, verifies and installs [info]. Returns true on success.
     * Records the prompt key so the automatic checker does not re-prompt in a loop.
     */
    suspend fun downloadAndInstall(info: MobileVersionResponse): Boolean = withContext(Dispatchers.IO) {
        if (info.versionCode == null) return@withContext false

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

        prefs.edit().putString(KEY_LAST_PROMPTED, promptKey(info)).apply()
        val result = installViaSession(apk)

        if (result == PackageInstaller.STATUS_FAILURE_CONFLICT) {
            // Do NOT try to self-uninstall and retry here: uninstalling this app kills
            // its own running process (and wipes the cache dir holding the downloaded
            // APK) before a retry install could ever run, leaving the device with
            // nothing installed at all. A signing-key mismatch (e.g. a leftover
            // debug-signed install) can only be resolved by a manual reinstall of a
            // release-signed build — fail safely and leave the current app in place.
            Log.e(TAG, "signing conflict — device needs a manual reinstall of a release-signed build")
            false
        } else {
            result == PackageInstaller.STATUS_SUCCESS
        }
    }

    private suspend fun installViaSession(apk: File): Int = withContext(Dispatchers.IO) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        ).apply {
            setSize(apk.length())
        }

        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("vairiot-update", 0, apk.length()).use { out ->
                FileInputStream(apk).use { input -> input.copyTo(out) }
                session.fsync(out)
            }

            suspendCancellableCoroutine { cont ->
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context, intent: Intent) {
                        val status = intent.getIntExtra(
                            PackageInstaller.EXTRA_STATUS,
                            PackageInstaller.STATUS_FAILURE
                        )
                        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        Log.i(TAG, "install status=$status msg=$msg")

                        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                            val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(Intent.EXTRA_INTENT)
                            }
                            confirmIntent?.let {
                                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                context.startActivity(it)
                            }
                            return
                        }
                        context.unregisterReceiver(this)
                        if (cont.isActive) cont.resume(status)
                    }
                }

                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }

                // ContextCompat handles the SDK-33 RECEIVER_* flag requirement on
                // all API levels and satisfies lint's UnspecifiedRegisterReceiverFlag.
                // EXPORTED preserves prior behaviour (the PackageInstaller status
                // broadcast is delivered via our own PendingIntent).
                ContextCompat.registerReceiver(
                    context, receiver, IntentFilter(ACTION_INSTALL_STATUS),
                    ContextCompat.RECEIVER_EXPORTED,
                )

                val pendingIntent = PendingIntent.getBroadcast(
                    context, sessionId, Intent(ACTION_INSTALL_STATUS), flags
                )
                session.commit(pendingIntent.intentSender)

                cont.invokeOnCancellation {
                    try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                    try { installer.abandonSession(sessionId) } catch (_: Exception) {}
                }
            }
        }
    }

    private suspend fun downloadToCache(info: MobileVersionResponse): File? = withContext(Dispatchers.IO) {
        try {
            val body = api.downloadApk()
            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
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
}
