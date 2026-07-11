package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.AssetRepository
import com.vairiot.app.data.ScanSessionRepository
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.domain.model.SessionSnapshot
import com.vairiot.app.scanner.ScanType
import com.vairiot.app.scanner.ScannerHealth
import com.vairiot.app.scanner.ScannerHealthMonitor
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ScanSessionUiState {
    object Loading                                         : ScanSessionUiState()
    data class Active(val snapshot: SessionSnapshot)       : ScanSessionUiState()
    data class Completing(val snapshot: SessionSnapshot)   : ScanSessionUiState()
    data class Completed(val snapshot: SessionSnapshot)    : ScanSessionUiState()
    data class Error(val message: String)                  : ScanSessionUiState()
}

@HiltViewModel
class ScanSessionViewModel @Inject constructor(
    private val repo:          ScanSessionRepository,
    private val assetRepo:     AssetRepository,
    private val scanner:       ScannerService,
    private val healthMonitor: ScannerHealthMonitor,
    savedStateHandle:          SavedStateHandle,
) : ViewModel() {

    val sessionId: String = savedStateHandle["sessionId"] ?: ""

    private val _state = MutableStateFlow<ScanSessionUiState>(ScanSessionUiState.Loading)
    val state: StateFlow<ScanSessionUiState> = _state

    val scannerHealth: StateFlow<ScannerHealth> = healthMonitor.health

    private val _isScanning = MutableStateFlow(false)
    /** True while the reader is actively sweeping for RFID tags, for the "searching" animation. */
    val isScanning: StateFlow<Boolean> = _isScanning

    private val _liveTagsSeen = MutableStateFlow(0)
    /**
     * Count of distinct EPCs read since the current sweep started — updates the
     * instant a read arrives, ahead of [ScanSessionRepository]'s read-confidence
     * gating (which holds a tag as PENDING, invisible in the Known/New/Missing
     * tabs, until it has 3 reads or has stayed visible 500ms). Gives the operator
     * live "something is happening" feedback during the search itself.
     */
    val liveTagsSeen: StateFlow<Int> = _liveTagsSeen
    private val epcsSeenThisSweep = mutableSetOf<String>()

    val supportsPowerControl: Boolean = scanner.supportsPowerControl
    val powerRangeDbm: IntRange? = scanner.powerRangeDbm

    private val _powerDbm = MutableStateFlow<Int?>(null)
    /** Current reader TX power in dBm, or null if unknown/unsupported. */
    val powerDbm: StateFlow<Int?> = _powerDbm

    private val _registerTarget = MutableStateFlow<String?>(null)
    /** EPC currently open in the "Register new asset" dialog. */
    val registerTarget: StateFlow<String?> = _registerTarget

    private val _assignTarget = MutableStateFlow<String?>(null)
    /** EPC currently open in the "Assign existing asset" dialog. */
    val assignTarget: StateFlow<String?> = _assignTarget

    /** All cached assets — fed into the Assign dialog's search list. */
    val assignableAssets: StateFlow<List<AssetResponse>> =
        assetRepo.observeAssets("")
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        if (sessionId.isBlank()) {
            _state.value = ScanSessionUiState.Error("Missing session ID")
        } else {
            viewModelScope.launch {
                scanner.scanResults.collect { result ->
                    if (result.type != ScanType.RFID_UHF) return@collect
                    healthMonitor.markScanReceived()
                    if (epcsSeenThisSweep.add(result.value)) {
                        _liveTagsSeen.value = epcsSeenThisSweep.size
                    }
                    runCatching { repo.recordRead(sessionId, result.value) }
                }
            }
            viewModelScope.launch {
                repo.observeSnapshot(sessionId).collect { snapshot ->
                    val next = when (val curr = _state.value) {
                        is ScanSessionUiState.Completing -> ScanSessionUiState.Completing(snapshot)
                        is ScanSessionUiState.Completed  -> ScanSessionUiState.Completed(snapshot)
                        else -> ScanSessionUiState.Active(snapshot)
                    }
                    _state.value = next
                }
            }
        }
    }

    fun triggerScan() {
        epcsSeenThisSweep.clear()
        _liveTagsSeen.value = 0
        _isScanning.value = true
        scanner.startScan(ScanType.RFID_UHF)
    }

    fun stopScan() {
        _isScanning.value = false
        scanner.stopScan()
    }

    fun retryScannerRecovery() = healthMonitor.attemptRecovery()

    /** Re-reads the reader's current TX power — call once the reader reports connected. */
    fun refreshPower() {
        if (!supportsPowerControl) return
        viewModelScope.launch {
            _powerDbm.value = scanner.getPowerDbm()
        }
    }

    fun setPower(dbm: Int) {
        if (!supportsPowerControl) return
        viewModelScope.launch {
            runCatching { scanner.setPowerDbm(dbm) }
                .onSuccess { _powerDbm.value = dbm }
        }
    }

    fun ignoreTag(epc: String) {
        viewModelScope.launch {
            runCatching { repo.ignoreTag(sessionId, epc, userId = null) }
        }
    }

    fun openRegister(epc: String)  { _registerTarget.value = epc }
    fun closeRegister()            { _registerTarget.value = null }

    fun openAssign(epc: String)    { _assignTarget.value = epc }
    fun closeAssign()              { _assignTarget.value = null }

    fun assignExistingAsset(epc: String, assetId: String) {
        viewModelScope.launch {
            try {
                repo.assignExistingAsset(sessionId, epc, assetId)
                _assignTarget.value = null
            } catch (e: Exception) {
                _state.value = ScanSessionUiState.Error("Assign failed: ${e.message}")
            }
        }
    }

    fun registerNewAsset(epc: String, name: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                repo.registerNewAsset(sessionId, epc, name)
                _registerTarget.value = null
                onDone()
            } catch (e: Exception) {
                _state.value = ScanSessionUiState.Error("Registration failed: ${e.message}")
            }
        }
    }

    fun completeSession(onCompleted: (SessionSnapshot) -> Unit) {
        val curr = _state.value
        val snapshot = when (curr) {
            is ScanSessionUiState.Active     -> curr.snapshot
            is ScanSessionUiState.Completing -> curr.snapshot
            is ScanSessionUiState.Completed  -> { onCompleted(curr.snapshot); return }
            else                             -> null
        }
        if (snapshot != null) _state.value = ScanSessionUiState.Completing(snapshot)
        _isScanning.value = false
        scanner.stopScan()
        viewModelScope.launch {
            try {
                val final = repo.completeSession(sessionId)
                _state.value = ScanSessionUiState.Completed(final)
                // Best-effort upload; failure is silent (session stays on device).
                launch { runCatching { repo.uploadSession(sessionId) } }
                onCompleted(final)
            } catch (e: Exception) {
                _state.value = ScanSessionUiState.Error("Complete failed: ${e.message}")
            }
        }
    }
}
