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
import com.nordicid.nuraccessory.NurAccessoryExtension
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
) : ScannerService {

    private val _scanResults = MutableSharedFlow<ScanResult>(extraBufferCapacity = 64)
    override val scanResults: SharedFlow<ScanResult> = _scanResults

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val nurApi = NurApi()
    private var autoTransport: NurApiAutoConnectTransport? = null
    private var accessoryExt: NurAccessoryExtension? = null
    private var streaming = false

    private val nurListener = object : NurApiListener {
        override fun connectedEvent() {
            Log.i(TAG, "NUR reader connected (fw=${nurApi.fileVersion ?: "?"})")
            try { accessoryExt = NurAccessoryExtension(nurApi) }
            catch (e: Exception) { Log.w(TAG, "AccessoryExtension init failed", e) }
        }

        override fun disconnectedEvent() {
            Log.w(TAG, "NUR reader disconnected")
            streaming = false
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
        scope.launch { connectIntegratedReader() }
    }

    override fun startScan() {
        if (!nurApi.isConnected) {
            Log.w(TAG, "Reader not connected, cannot start scan")
            return
        }
        if (streaming) return
        try {
            nurApi.clearIdBuffer(true)
            nurApi.startInventoryStream()
            streaming = true
            Log.d(TAG, "Inventory stream started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start inventory stream", e)
        }
    }

    override fun stopScan() {
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
    }
}
