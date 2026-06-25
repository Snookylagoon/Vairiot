package com.vairiot.app.scanner

import kotlinx.coroutines.flow.SharedFlow

enum class ScanType { BARCODE, RFID_UHF, UNKNOWN }

data class ScanResult(val value: String, val type: ScanType)

interface ScannerService {
    val scanResults: SharedFlow<ScanResult>
    val supportsRfid: Boolean
        get() = true
    val supportsBarcode: Boolean
        get() = true
    fun startScan(type: ScanType = ScanType.RFID_UHF)
    fun stopScan()

    // Inject a result from an external source (e.g. camera fallback scanner)
    fun injectResult(result: ScanResult) {}
}
