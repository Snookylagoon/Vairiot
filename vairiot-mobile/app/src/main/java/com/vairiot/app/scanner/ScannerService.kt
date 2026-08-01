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
    // Whether the in-app CameraX barcode fallback is usable. False on devices
    // whose camera isn't exposed to Camera2 (e.g. Meferi ME65), where it can't
    // bind a camera and the hardware scanner is used instead.
    val supportsCameraScan: Boolean
        get() = true
    // Whether the RFID reader's TX power can be read/adjusted from the app.
    val supportsPowerControl: Boolean
        get() = false
    // Valid TX power range in dBm, or null if unsupported.
    val powerRangeDbm: IntRange?
        get() = null
    fun startScan(type: ScanType = ScanType.RFID_UHF)
    fun stopScan()

    // Current RFID reader TX power in dBm, or null if unknown/unsupported.
    suspend fun getPowerDbm(): Int? = null
    suspend fun setPowerDbm(dbm: Int) {}

    // Whether this reader can write/lock UHF tag EPC memory (tag commissioning).
    val supportsTagWrite: Boolean
        get() = false

    /** Read the first 96 bits (24 hex chars) of the TID bank of the tag matching [epcHex]. */
    suspend fun readTagTid(epcHex: String): Result<String> =
        Result.failure(UnsupportedOperationException("Tag write not supported on this device"))

    /** Rewrite EPC memory of the tag currently answering to [currentEpcHex]. */
    suspend fun writeTagEpc(currentEpcHex: String, newEpcHex: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("Tag write not supported on this device"))

    /** Permanently lock EPC memory of the tag matching [epcHex]. Irreversible. */
    suspend fun permalockTagEpc(epcHex: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("Tag write not supported on this device"))

    // Inject a result from an external source (e.g. camera fallback scanner)
    fun injectResult(result: ScanResult) {}
}
