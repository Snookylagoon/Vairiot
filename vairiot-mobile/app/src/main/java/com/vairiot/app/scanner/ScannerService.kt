package com.vairiot.app.scanner

import kotlinx.coroutines.flow.SharedFlow

enum class ScanType { BARCODE, RFID_UHF, UNKNOWN }

data class ScanResult(val value: String, val type: ScanType)

interface ScannerService {
    val scanResults: SharedFlow<ScanResult>
    /** True if this hardware can read UHF RFID tags (e.g. Nordic ID HH83). */
    val supportsRfid: Boolean
        get() = true
    /** True if this hardware has a built-in 1D/2D barcode imager. */
    val supportsBarcode: Boolean
        get() = true
    fun startScan(type: ScanType = ScanType.RFID_UHF)
    fun stopScan()
}
