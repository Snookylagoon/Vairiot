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

    fun triggerScan() = scanner.startScan(ScanType.RFID_UHF)
    fun stopScan() = scanner.stopScan()
    fun retryScannerRecovery() = healthMonitor.attemptRecovery()

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
