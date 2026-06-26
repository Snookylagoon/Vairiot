package com.vairiot.app.scanner

import android.content.Context
import android.util.Log
import com.nordicid.nurapi.BleScanner
import com.nordicid.nurapi.NurApi
import com.nordicid.nurapi.NurApiAutoConnectTransport
import com.nordicid.nurapi.NurApiListener
import com.nordicid.nurapi.NurDeviceSpec
import com.nordicid.nurapi.NurEventAutotune
import com.nordicid.nurapi.NurEventClientInfo
import com.nordicid.nurapi.NurEventDeviceInfo
import com.nordicid.nurapi.NurEventEpcEnum
import com.nordicid.nurapi.NurEventFrequencyHop
import com.nordicid.nurapi.NurEventIOChange
import com.nordicid.nurapi.NurEventInventory
import com.nordicid.nurapi.NurEventNxpAlarm
import com.nordicid.nurapi.NurEventProgrammingProgress
import com.nordicid.nurapi.NurEventTagTrackingChange
import com.nordicid.nurapi.NurEventTagTrackingData
import com.nordicid.nurapi.NurEventTraceTag
import com.nordicid.nurapi.NurEventTriggeredRead
import com.nordicid.nuraccessory.AccessoryBarcodeResult
import com.nordicid.nuraccessory.AccessoryBarcodeResultListener
import com.nordicid.nuraccessory.NurAccessoryExtension
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NordicIdScannerService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val healthMonitor: ScannerHealthMonitor,
) : ScannerService {

    private val _scanResults = MutableSharedFlow<ScanResult>(extraBufferCapacity = 64)
    override val scanResults: SharedFlow<ScanResult> = _scanResults

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val nurApi = NurApi()
    private var autoTransport: NurApiAutoConnectTransport? = null
    private var accessoryExt: NurAccessoryExtension? = null
    private var streaming = false
    private var activeScanType: ScanType = ScanType.RFID_UHF

    // Nordic ID's NUR Accessory API delivers barcode results via this listener
    // (HH83 / EXA51 / SAMPO etc. integrated 1D/2D imager).
    private val barcodeListener = AccessoryBarcodeResultListener { result: AccessoryBarcodeResult? ->
        val value = result?.strBarcode?.trim().orEmpty()
        if (value.isNotEmpty()) {
            Log.d(TAG, "Nordic ID barcode result: status=${result?.status} value=$value")
            _scanResults.tryEmit(ScanResult(value, ScanType.BARCODE))
        } else {
            Log.d(TAG, "Nordic ID barcode result: status=${result?.status} (empty)")
        }
    }

    // Legacy Newland / Meferi style broadcast receiver — graceful no-op on HH83
    // but kept so a single APK still works on other vendor handhelds.
    private val barcodeReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            val value = BARCODE_EXTRAS.firstNotNullOfOrNull { intent.getStringExtra(it)?.trim()?.ifBlank { null } }
                ?: intent.extras?.keySet()?.firstNotNullOfOrNull { k ->
                    intent.extras?.getString(k)?.trim()?.takeIf { it.length in 4..256 }
                }
            if (!value.isNullOrBlank()) {
                Log.d(TAG, "Barcode scan received: $value")
                _scanResults.tryEmit(ScanResult(value, ScanType.BARCODE))
            }
        }
    }

    private val nurListener = object : NurApiListener {
        override fun connectedEvent() {
            Log.i(TAG, "NUR reader connected (fw=${nurApi.fileVersion ?: "?"})")
            // The integrated reader is live — clear the "Offline" state without
            // requiring the user to fire a scan first.
            healthMonitor.reportConnected()
            try {
                val ext = NurAccessoryExtension(nurApi)
                accessoryExt = ext
                ext.registerBarcodeResultListener(barcodeListener)
                try { ext.imagerPower(true) } catch (e: Exception) {
                    Log.d(TAG, "imagerPower(true) not supported: ${e.message}")
                }
                Log.i(TAG, "Nordic ID barcode imager listener registered")
            }
            catch (e: Exception) { Log.w(TAG, "AccessoryExtension init failed", e) }
        }

        override fun disconnectedEvent() {
            Log.w(TAG, "NUR reader disconnected")
            streaming = false
            healthMonitor.reportDisconnected()
        }

        override fun inventoryStreamEvent(event: NurEventInventory) {
            Log.d(TAG, "inventoryStreamEvent: tagsAdded=${event.tagsAdded} stopped=${event.stopped} rounds=${event.roundsDone}")
            if (event.tagsAdded > 0) {
                scope.launch { drainTags() }
            }
        }

        override fun IOChangeEvent(event: NurEventIOChange) {
            if (event.source == TRIGGER_SOURCE) {
                if (event.direction == TRIGGER_PRESSED) startScan()
                else stopScan()
            }
        }

        override fun logEvent(level: Int, txt: String?) {}
        override fun bootEvent(mode: String?) {}
        override fun inventoryExtendedStreamEvent(event: NurEventInventory?) {}
        override fun programmingProgressEvent(event: NurEventProgrammingProgress?) {}
        override fun traceTagEvent(event: NurEventTraceTag?) {}
        override fun triggeredReadEvent(event: NurEventTriggeredRead?) {}
        override fun frequencyHopEvent(event: NurEventFrequencyHop?) {}
        override fun debugMessageEvent(txt: String?) {}
        override fun epcEnumEvent(event: NurEventEpcEnum?) {}
        override fun autotuneEvent(event: NurEventAutotune?) {}
        override fun tagTrackingScanEvent(event: NurEventTagTrackingData?) {}
        override fun tagTrackingChangeEvent(event: NurEventTagTrackingChange?) {}
        override fun nxpEasAlarmEvent(event: NurEventNxpAlarm?) {}
        override fun clientConnectedEvent(event: NurEventClientInfo?) {}
        override fun clientDisconnectedEvent(event: NurEventClientInfo?) {}
        override fun deviceSearchEvent(event: NurEventDeviceInfo?) {}
    }

    init {
        BleScanner.init(context)
        nurApi.setListener(nurListener)
        // Drive scanner health from the NUR reader's connection state, and make
        // the Retry button re-establish the reader link instead of firing the
        // (no-op on this hardware) Meferi recovery broadcasts.
        healthMonitor.bindBackend { reconnectReader() }
        // If the reader is already connected when the screen opens, reflect it.
        if (nurApi.isConnected) healthMonitor.reportConnected()
        scope.launch { connectIntegratedReader() }

        val filter = IntentFilter().apply {
            BARCODE_ACTIONS.forEach { addAction(it) }
        }
        ContextCompat.registerReceiver(context, barcodeReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        Log.d(TAG, "Registered for ${BARCODE_ACTIONS.size} barcode broadcast actions")
    }

    override fun startScan(type: ScanType) {
        activeScanType = type
        when (type) {
            ScanType.BARCODE -> {
                val ext = accessoryExt
                if (ext != null) {
                    try {
                        Log.d(TAG, "Starting barcode scan via NurAccessoryExtension (timeout=${BARCODE_TIMEOUT_MS}ms)")
                        ext.readBarcodeAsync(BARCODE_TIMEOUT_MS)
                    } catch (e: Exception) {
                        Log.w(TAG, "readBarcodeAsync failed: ${e.message}")
                    }
                } else {
                    Log.w(TAG, "NurAccessoryExtension not ready — cannot fire barcode scan")
                }
                // Also fan out legacy broadcasts so non-Nordic handhelds still react.
                START_BARCODE_ACTIONS.forEach { action ->
                    runCatching { context.sendBroadcast(Intent(action).setPackage(null)) }
                }
            }
            else -> {
                if (!nurApi.isConnected) {
                    Log.w(TAG, "Reader not connected, cannot start RFID scan")
                    return
                }
                if (streaming) return
                try {
                    nurApi.clearIdBuffer(true)
                    nurApi.startInventoryStream()
                    streaming = true
                    Log.d(TAG, "RFID inventory stream started")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start inventory stream", e)
                }
            }
        }
    }

    override fun stopScan() {
        try { accessoryExt?.cancelBarcodeAsync() } catch (e: Exception) {
            Log.d(TAG, "cancelBarcodeAsync ignored: ${e.message}")
        }
        STOP_BARCODE_ACTIONS.forEach { action ->
            runCatching { context.sendBroadcast(Intent(action)) }
        }
        if (!streaming) return
        try {
            nurApi.stopInventoryStream()
            streaming = false
            drainTags()
            Log.d(TAG, "Inventory stream stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop inventory stream", e)
        }
    }

    private fun drainTags() {
        try {
            val storage = nurApi.storage ?: return
            for (i in 0 until storage.size()) {
                val tag = storage[i]
                val epc = tag.epcString.orEmpty().trim()
                if (epc.isNotBlank()) {
                    Log.d(TAG, "Tag read: $epc")
                    _scanResults.tryEmit(ScanResult(epc, ScanType.RFID_UHF))
                }
            }
            nurApi.clearIdBuffer(false)
        } catch (e: Exception) {
            Log.e(TAG, "Error draining tags", e)
        }
    }

    // Invoked from the Retry button via ScannerHealthMonitor.attemptRecovery().
    private fun reconnectReader() {
        if (nurApi.isConnected) {
            healthMonitor.reportConnected()
            return
        }
        // Tear down and recreate the auto-connect transport to re-establish the link.
        runCatching { autoTransport?.dispose() }
        autoTransport = null
        scope.launch { connectIntegratedReader() }
    }

    private fun connectIntegratedReader() {
        try {
            val spec = NurDeviceSpec(INT_READER_SPEC)
            autoTransport = NurDeviceSpec.createAutoConnectTransport(context, nurApi, spec)
            autoTransport?.setAddress(INT_READER_ADDR)
            Log.i(TAG, "Auto-connect transport created for integrated reader")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect to integrated reader", e)
        }
    }

    companion object {
        private const val TAG = "NordicIdScanner"
        private const val TRIGGER_SOURCE = 100
        private const val TRIGGER_PRESSED = 1
        private const val INT_READER_SPEC = "type=INT;addr=integrated_reader"
        private const val INT_READER_ADDR = "integrated_reader"
        private const val BARCODE_TIMEOUT_MS = 5000

        private val BARCODE_ACTIONS = listOf(
            "nlscan.action.SCANNER_RESULT",
            "com.android.action.SEND_SCAN_RESULT",
            "android.intent.action.SCANRESULT",
        )

        private val BARCODE_EXTRAS = listOf(
            "SCAN_BARCODE1", "SCAN_BARCODE2",
            "scannerdata", "barcode_string", "data",
        )

        private val START_BARCODE_ACTIONS = listOf(
            "nlscan.action.START_SCAN",
            "com.android.action.START_SCAN",
        )

        private val STOP_BARCODE_ACTIONS = listOf(
            "nlscan.action.STOP_SCAN",
            "com.android.action.STOP_SCAN",
        )
    }
}
