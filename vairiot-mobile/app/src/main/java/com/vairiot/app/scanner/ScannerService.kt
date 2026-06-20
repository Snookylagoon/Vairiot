package com.vairiot.app.scanner

import kotlinx.coroutines.flow.SharedFlow

enum class ScanType { BARCODE, RFID_UHF, UNKNOWN }

data class ScanResult(val value: String, val type: ScanType)

interface ScannerService {
    val scanResults: SharedFlow<ScanResult>
    fun startScan(type: ScanType = ScanType.RFID_UHF)
    fun stopScan()
}
