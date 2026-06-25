package com.vairiot.app.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
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

@Singleton
class UpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: UpdateApi,
) {
    /**
     * Returns true if an update was downloaded and installed successfully.
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
        val result = installViaSession(apk)

        if (result == PackageInstaller.STATUS_FAILURE_CONFLICT) {
            Log.w(TAG, "signing conflict detected — uninstalling old package and retrying")
            val uninstalled = uninstallPackage()
            if (uninstalled) {
                val retryResult = installViaSession(apk)
                retryResult == PackageInstaller.STATUS_SUCCESS
            } else {
                Log.e(TAG, "uninstall failed — cannot resolve signing conflict")
                false
            }
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

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(receiver, IntentFilter(ACTION_INSTALL_STATUS), Context.RECEIVER_EXPORTED)
                } else {
                    context.registerReceiver(receiver, IntentFilter(ACTION_INSTALL_STATUS))
                }

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

    private suspend fun uninstallPackage(): Boolean = withContext(Dispatchers.IO) {
        suspendCancellableCoroutine { cont ->
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    val status = intent.getIntExtra(
                        PackageInstaller.EXTRA_STATUS,
                        PackageInstaller.STATUS_FAILURE
                    )
                    val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    Log.i(TAG, "uninstall status=$status msg=$msg")

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
                    if (cont.isActive) cont.resume(status == PackageInstaller.STATUS_SUCCESS)
                }
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, IntentFilter(ACTION_INSTALL_STATUS), Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(receiver, IntentFilter(ACTION_INSTALL_STATUS))
            }

            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, Intent(ACTION_INSTALL_STATUS), flags
            )
            context.packageManager.packageInstaller.uninstall(
                context.packageName, pendingIntent.intentSender
            )

            cont.invokeOnCancellation {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
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
