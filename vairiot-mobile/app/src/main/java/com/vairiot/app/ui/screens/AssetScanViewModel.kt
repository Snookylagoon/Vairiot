package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.AssetRepository
import com.vairiot.app.data.TagLookup
import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.scanner.ScanType
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ScanUiState {
    object Idle    : ScanUiState()
    data class Scanning(val expecting: ScanType = ScanType.RFID_UHF) : ScanUiState()
    object Loading : ScanUiState()
    data class Found(val asset: AssetResponse, val fromCache: Boolean = false) : ScanUiState()
    /**
     * An unregistered code. [value] is what was read, [isRfid] says whether it
     * came from the RFID antenna (true) or the barcode scanner (false).
     * [secondaryValue] holds the other code if the user scans it during registration.
     */
    data class NotFound(
        val value: String,
        val isRfid: Boolean,
        val secondaryValue: String? = null,
    ) : ScanUiState()
    object Registering                         : ScanUiState()
    data class Registered(val asset: AssetResponse) : ScanUiState()
    data class Error(val message: String)      : ScanUiState()
}

@HiltViewModel
class AssetScanViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val repo: AssetRepository,
    private val scanner: ScannerService,
) : ViewModel() {

    private val _state = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val state: StateFlow<ScanUiState> = _state

    private var scanTimeoutJob: Job? = null
    private var awaitingSecondary = false

    init {
        viewModelScope.launch {
            scanner.scanResults.collect { result ->
                if (awaitingSecondary) {
                    // User is deliberately scanning the *other* code for an unknown asset.
                    awaitingSecondary = false
                    scanner.stopScan()
                    val current = _state.value
                    if (current is ScanUiState.NotFound) {
                        _state.value = current.copy(secondaryValue = result.value)
                    }
                } else {
                    onScan(result.value, result.type)
                }
            }
        }
    }

    /** Whether the underlying device exposes a UHF RFID radio. */
    val supportsRfid:    Boolean get() = scanner.supportsRfid
    /** Whether the underlying device exposes a barcode imager. */
    val supportsBarcode: Boolean get() = scanner.supportsBarcode

    fun triggerScan(type: ScanType = ScanType.RFID_UHF) {
        _state.value = ScanUiState.Scanning(type)
        scanner.startScan(type)
        scanTimeoutJob?.cancel()
        scanTimeoutJob = viewModelScope.launch {
            delay(SCAN_TIMEOUT_MS)
            if (_state.value is ScanUiState.Scanning) {
                _state.value = ScanUiState.Error(
                    "No scan detected. Press the device's hardware trigger, or type the code in the field above."
                )
            }
        }
    }

    fun triggerBarcodeScan() = triggerScan(ScanType.BARCODE)

    fun cancelScan() {
        scanTimeoutJob?.cancel()
        scanner.stopScan()
        _state.value = ScanUiState.Idle
    }

    /** A scan arrived from hardware, carrying its read source ([type]). */
    private fun onScan(value: String, type: ScanType) {
        val isRfid = type != ScanType.BARCODE   // RFID_UHF or UNKNOWN treated as tag
        lookup(value, isRfid)
    }

    private fun lookup(value: String, isRfid: Boolean) {
        scanTimeoutJob?.cancel()
        viewModelScope.launch {
            _state.value = ScanUiState.Loading
            when (val result = repo.lookupByTag(value)) {
                is TagLookup.Found ->
                    _state.value = ScanUiState.Found(result.asset, fromCache = result.fromCache)
                is TagLookup.NotFound ->
                    _state.value = ScanUiState.NotFound(value = value, isRfid = isRfid)
            }
        }
    }

    /** Start a deliberate scan of the *other* code type during registration. */
    fun scanSecondary() {
        awaitingSecondary = true
        val current = _state.value
        // If the primary was RFID, we now want a barcode, and vice versa.
        val wantType = if (current is ScanUiState.NotFound && current.isRfid)
            ScanType.BARCODE else ScanType.RFID_UHF
        scanner.startScan(wantType)
    }

    fun clearSecondary() {
        val current = _state.value
        if (current is ScanUiState.NotFound) {
            _state.value = current.copy(secondaryValue = null)
        }
    }

    /**
     * Register a new asset, routing each scanned value to the correct field by
     * its read source. The primary value goes to rfidTag or barcode depending
     * on [isRfid]; the secondary (if any) fills the other field.
     */
    fun registerAsset(name: String, value: String, isRfid: Boolean, secondaryValue: String? = null) {
        viewModelScope.launch {
            _state.value = ScanUiState.Registering
            val rfidTag = if (isRfid) value else secondaryValue
            val barcode = if (isRfid) secondaryValue else value
            try {
                val asset = api.createAsset(
                    AssetCreateRequest(name = name, rfidTag = rfidTag, barcode = barcode),
                )
                _state.value = ScanUiState.Registered(asset)
            } catch (e: Exception) {
                _state.value = ScanUiState.Error("Registration failed: ${e.message}")
            }
        }
    }

    /** Manual text lookup: source unknown, so treat as an RFID tag by default. */
    fun lookupManual(query: String) = lookup(query, isRfid = true)

    fun reset() {
        scanTimeoutJob?.cancel()
        _state.value = ScanUiState.Idle
    }

    companion object {
        private const val SCAN_TIMEOUT_MS = 5_000L
    }
}
