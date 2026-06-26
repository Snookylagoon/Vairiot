package com.vairiot.app.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

enum class ScannerHealth { READY, UNAVAILABLE, RECOVERING }

@Singleton
class ScannerHealthMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _health = MutableStateFlow(ScannerHealth.UNAVAILABLE)
    val health: StateFlow<ScannerHealth> = _health.asStateFlow()

    // Track broadcasts from the scanner to determine liveness
    @Volatile private var lastBroadcastAt = 0L

    // When an active scanner backend (e.g. the Nordic ID NUR reader on the HH83)
    // drives health from its own connection state, the Meferi package/broadcast
    // heuristics don't apply and are disabled.
    @Volatile private var backendBound = false
    @Volatile private var backendRecovery: (() -> Unit)? = null

    private val scannerBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            lastBroadcastAt = System.currentTimeMillis()
            setState(ScannerHealth.READY)
        }
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            val pkg = intent?.data?.schemeSpecificPart ?: return
            if (pkg == SCANNER_PACKAGE) {
                Log.d(TAG, "Package event for scanner: ${intent.action}")
                // Scanner was restarted/replaced — give it a moment and re-probe
                scope.launch {
                    delay(3_000)
                    probe()
                }
            }
        }
    }

    init {
        // Listen for actual scan result broadcasts — if we get one, the scanner is alive
        val scanFilter = IntentFilter().apply {
            addAction("com.meferi.action.SCANNER.RESULTS")
            addAction("com.meferi.action.SCANNER.RESULT")
            addAction("com.meferi.decoderesult")
            addAction("com.vairiot.scan.RESULT")
        }
        ContextCompat.registerReceiver(context, scannerBroadcastReceiver, scanFilter, ContextCompat.RECEIVER_EXPORTED)

        // Listen for package lifecycle events
        val pkgFilter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_RESTARTED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addDataScheme("package")
        }
        ContextCompat.registerReceiver(context, packageReceiver, pkgFilter, ContextCompat.RECEIVER_EXPORTED)

        Log.d(TAG, "ScannerHealthMonitor init")
        scope.launch {
            delay(2_000)
            if (backendBound) {
                Log.d(TAG, "Backend-bound scanner — skipping Meferi package probe")
                return@launch
            }
            val installed = try {
                context.packageManager.getPackageInfo(SCANNER_PACKAGE, 0)
                true
            } catch (_: PackageManager.NameNotFoundException) { false }
            Log.d(TAG, "Scanner package installed: $installed")
            setState(if (installed) ScannerHealth.READY else ScannerHealth.UNAVAILABLE)
        }
    }

    /**
     * Bind an active scanner backend that reports its own hardware liveness
     * (e.g. the Nordic ID NUR reader on the HH83). This disables the Meferi
     * package/broadcast heuristics — health then reflects the reader's actual
     * connection state. [onRecover] is invoked when the user taps Retry.
     */
    fun bindBackend(onRecover: (() -> Unit)? = null) {
        backendBound = true
        backendRecovery = onRecover
    }

    /** The active backend reports its scanner hardware is connected and live. */
    fun reportConnected() {
        lastBroadcastAt = System.currentTimeMillis()
        setState(ScannerHealth.READY)
    }

    /** The active backend reports its scanner hardware has disconnected. */
    fun reportDisconnected() {
        setState(ScannerHealth.UNAVAILABLE)
    }

    fun markScanReceived() {
        lastBroadcastAt = System.currentTimeMillis()
        setState(ScannerHealth.READY)
    }

    fun markScanTimeout() {
        setState(ScannerHealth.UNAVAILABLE)
    }

    fun attemptRecovery() {
        scope.launch {
            setState(ScannerHealth.RECOVERING)

            if (backendBound) {
                // Let the active backend re-establish its own connection. The
                // callback is responsible for reporting the resolved state.
                runCatching { backendRecovery?.invoke() }
                delay(3_000)
                checkHealth()
                return@launch
            }

            // Try waking the scanner via a shoot broadcast
            runCatching {
                context.sendBroadcast(Intent("com.meferi.action.SCANNER.SHOOT").setPackage(null))
            }
            delay(3_000)

            if (_health.value != ScannerHealth.READY) {
                // Try a switch/reset broadcast
                runCatching {
                    context.sendBroadcast(Intent("com.meferi.action.SWITCH.SCAN"))
                }
                delay(3_000)
            }

            if (_health.value != ScannerHealth.READY) {
                // Last resort: try to launch scanner via shell
                runCatching {
                    Runtime.getRuntime().exec(
                        arrayOf("am", "broadcast", "-a", "com.meferi.action.SCANNER.SHOOT")
                    )
                }
                delay(3_000)
            }

            // Check if we got a broadcast during the recovery attempts
            checkHealth()
        }
    }

    // Send a probe broadcast and check if the scanner package is installed
    private fun probe() {
        val installed = try {
            context.packageManager.getPackageInfo(SCANNER_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

        if (!installed) {
            setState(ScannerHealth.UNAVAILABLE)
            return
        }

        // Send a probe — if scanner is alive, it may respond with a broadcast
        runCatching {
            context.sendBroadcast(Intent("com.meferi.action.SCANNER.SHOOT").setPackage(null))
        }

        // Check after a delay if we got a response
        scope.launch {
            delay(2_000)
            checkHealth()
        }
    }

    private fun checkHealth() {
        if (backendBound) {
            // Health is driven by the backend's connection reports; trust the
            // most recent liveness signal rather than the Meferi package probe.
            val now = System.currentTimeMillis()
            val recentBroadcast = lastBroadcastAt > 0 && (now - lastBroadcastAt) < 30_000
            if (recentBroadcast) {
                setState(ScannerHealth.READY)
            } else if (_health.value == ScannerHealth.RECOVERING) {
                // Recovery attempt didn't re-establish the link — report offline.
                setState(ScannerHealth.UNAVAILABLE)
            }
            return
        }

        val installed = try {
            context.packageManager.getPackageInfo(SCANNER_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

        if (!installed) {
            setState(ScannerHealth.UNAVAILABLE)
            return
        }

        // If we received a broadcast from the scanner within the last 30 seconds, it's alive
        val now = System.currentTimeMillis()
        val recentBroadcast = lastBroadcastAt > 0 && (now - lastBroadcastAt) < 30_000

        if (recentBroadcast) {
            setState(ScannerHealth.READY)
        } else if (_health.value == ScannerHealth.RECOVERING) {
            // Still recovering — don't flip to unavailable yet
        } else if (_health.value == ScannerHealth.READY && (now - lastBroadcastAt) > 60_000) {
            // Was ready but no broadcasts for over a minute — mark unavailable
            setState(ScannerHealth.UNAVAILABLE)
        } else if (_health.value == ScannerHealth.UNAVAILABLE) {
            // Package exists but no recent broadcasts — stay unavailable
        }
    }

    private fun setState(state: ScannerHealth) {
        val old = _health.value
        if (old != state) {
            Log.d(TAG, "$old -> $state")
            _health.value = state
        }
    }

    companion object {
        private const val TAG = "ScannerHealth"
        private const val SCANNER_PACKAGE = "com.meferi.scanner"
    }
}
