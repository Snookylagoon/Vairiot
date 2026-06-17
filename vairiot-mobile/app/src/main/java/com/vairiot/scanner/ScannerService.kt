package com.vairiot.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.meferi.sdk.ScanManager
import com.meferi.sdk.SoundManager
import com.meferi.sdk.scanner.configuration.Constants
import com.meferi.sdk.scanner.configuration.PropertyID
import com.meferi.sdk.scanner.configuration.Symbology
import com.meferi.sdk.scanner.configuration.Triggering
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

// ─── Data model ───────────────────────────────────────────────────────────────

data class ScanResult(
    val data: String,
    val symbology: String,
    val timestamp: Long = System.currentTimeMillis(),
)

// ─── Interface — shared by production and mock ────────────────────────────────

interface ScannerService {
    /** Emits a ScanResult every time a barcode or tag is successfully decoded. */
    val scanEvents: SharedFlow<ScanResult>

    /**
     * Configure the scanner before first use.
     * @param symbologies  List of barcode types to enable (e.g. Code128, QR).
     * @param mode         Triggering mode: MANUAL (default), CONTINUOUS, or HOST.
     */
    fun configure(symbologies: List<Symbology>, mode: Triggering = Triggering.MANUAL)

    /** Begin a scan session. */
    fun startScan()

    /** End the current scan session. */
    fun stopScan()

    /**
     * Release all resources. Must be called in onDestroy() or when the
     * ViewModel owning this service is cleared.
     */
    fun release()
}

// ─── Production implementation — Meferi hardware only ────────────────────────
//
// This class ONLY works on Meferi ME61 / ME65 / ME74 / ME40K devices.
// On any other Android device the ScanManager.getInstance() call will fail.
// Use MockScannerService for emulator testing and CI pipelines.
//
// ⚠️  Before shipping Phase 3: read the EDK documentation files:
//      • classcom_1_1meferi_1_1sdk_1_1_scan_manager.html
//      • classcom_1_1meferi_1_1sdk_1_1_me_wedge_manager.html
//      • ScanManagerDemo.html
//      • classcom_1_1meferi_1_1sdk_1_1scanner_1_1configuration_1_1_constants.html
//     Confirm the exact values for Constants.ACTION_SCAN_RESULT,
//     Constants.EXTRA_SCAN_DATA, and Constants.EXTRA_SCAN_SYMBOLOGY
//     before replacing the placeholder strings below.

class VairiotScannerServiceImpl(private val context: Context) : ScannerService {

    private val scanManager: ScanManager  = ScanManager.getInstance(context)
    private val soundManager: SoundManager = SoundManager.getInstance(context)

    private val _scanEvents = MutableSharedFlow<ScanResult>(extraBufferCapacity = 32)
    override val scanEvents: SharedFlow<ScanResult> = _scanEvents.asSharedFlow()

    // Broadcast receiver — Meferi MeWedge routes scan results as intents
    // ⚠️  Replace placeholder strings with exact constants from Constants.html
    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val data = intent.getStringExtra(Constants.EXTRA_SCAN_DATA) ?: return
            val sym  = intent.getStringExtra(Constants.EXTRA_SCAN_SYMBOLOGY).orEmpty()
            _scanEvents.tryEmit(ScanResult(data = data, symbology = sym))
            soundManager.scanSuccessBeep()
        }
    }

    init {
        // Register receiver immediately so scans are never missed
        context.registerReceiver(
            scanReceiver,
            IntentFilter(Constants.ACTION_SCAN_RESULT),
        )
    }

    override fun configure(symbologies: List<Symbology>, mode: Triggering) {
        scanManager.setProperty(PropertyID.SCAN_TRIGGER_MODE, mode)
        symbologies.forEach { symbology ->
            scanManager.enableSymbology(symbology, true)
        }
    }

    override fun startScan() { scanManager.startScan() }
    override fun stopScan()  { scanManager.stopScan()  }

    override fun release() {
        runCatching { context.unregisterReceiver(scanReceiver) }
    }
}

// ─── Mock implementation — emulator & unit tests (no hardware needed) ─────────

class MockScannerService : ScannerService {

    private val _scanEvents = MutableSharedFlow<ScanResult>(extraBufferCapacity = 32)
    override val scanEvents: SharedFlow<ScanResult> = _scanEvents.asSharedFlow()

    override fun configure(symbologies: List<Symbology>, mode: Triggering) { /* no-op */ }
    override fun startScan() { /* no-op */ }
    override fun stopScan()  { /* no-op */ }
    override fun release()   { /* no-op */ }

    /**
     * Emit a test scan result — call this from unit tests to simulate a scan.
     * Example:  mockScanner.emit("ASSET-001234", "QR_CODE")
     */
    suspend fun emit(data: String, symbology: String = "QR_CODE") {
        _scanEvents.emit(ScanResult(data = data, symbology = symbology))
    }
}
