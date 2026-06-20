package com.vairiot.app.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MeferiScannerService @Inject constructor(
    @ApplicationContext private val context: Context,
) : ScannerService {

    private val _scanResults = MutableSharedFlow<ScanResult>(extraBufferCapacity = 8)
    override val scanResults: SharedFlow<ScanResult> = _scanResults

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            val type = when (intent.action) {
                in UHF_ACTIONS     -> ScanType.RFID_UHF
                in BARCODE_ACTIONS -> ScanType.BARCODE
                else               -> ScanType.UNKNOWN
            }
            val value = extractFirstExtra(intent, type)
            if (!value.isNullOrBlank()) {
                Log.d(TAG, "Scan received: action=${intent.action} type=$type value=$value")
                _scanResults.tryEmit(ScanResult(value, type))
            }
        }
    }

    init {
        val filter = IntentFilter().apply {
            (BARCODE_ACTIONS + UHF_ACTIONS).forEach { addAction(it) }
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        Log.d(TAG, "Registered for ${BARCODE_ACTIONS.size + UHF_ACTIONS.size} scanner broadcast actions")
    }

    override fun startScan(type: ScanType) {
        val actions = when (type) {
            ScanType.BARCODE -> START_CAMERA_ACTIONS
            else             -> START_SCAN_ACTIONS
        }
        actions.forEach { action ->
            runCatching {
                context.sendBroadcast(Intent(action).setPackage(null))
            }.onFailure { Log.w(TAG, "startScan($type): $action failed: ${it.message}") }
        }
    }

    override fun stopScan() {
        STOP_SCAN_ACTIONS.forEach { action ->
            runCatching { context.sendBroadcast(Intent(action)) }
        }
    }

    private fun extractFirstExtra(intent: Intent, type: ScanType): String? {
        val keys = if (type == ScanType.RFID_UHF) UHF_EXTRAS else BARCODE_EXTRAS
        for (key in keys) {
            val s = intent.getStringExtra(key)
            if (!s.isNullOrBlank()) return s.trim()
        }
        intent.extras?.keySet()?.forEach { k ->
            val s = intent.extras?.getString(k)
            if (!s.isNullOrBlank() && s.length in 4..256) return s.trim()
        }
        return null
    }

    companion object {
        private const val TAG = "MeferiScanner"

        private val BARCODE_ACTIONS = listOf(
            "android.intent.action.MEF_ACTION",
            "android.intent.action.RECEIVE_SCANDATA_BROADCAST",
            "com.meferi.action.SCANNER.RESULT",
        )

        private val UHF_ACTIONS = listOf(
            "com.android.action.UHF_DATA",
            "com.rfid.UHF_DATA",
        )

        private val BARCODE_EXTRAS = listOf(
            "data",
            "com.meferi.mewedge.data_string",
            "meferi.scan.result.param.barcode",
        )

        private val UHF_EXTRAS = listOf("UHF_DATA", "EPC", "epc", "tag")

        private val START_SCAN_ACTIONS = listOf(
            "com.meferi.action.SCANNER.SHOOT",
        )

        private val START_CAMERA_ACTIONS = listOf(
            "com.meferi.action.CAMERA.SCAN",
        )

        private val STOP_SCAN_ACTIONS = listOf(
            "com.meferi.action.SWITCH.SCAN",
        )
    }
}
