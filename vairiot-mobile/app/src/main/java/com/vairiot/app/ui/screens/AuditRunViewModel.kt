package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedScan
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.scanner.ScannerService
import com.vairiot.app.sync.ScanSyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuditRunUiState(
    val campaignId: String = "",
    val isSubmitting: Boolean = false,
    val recentScans:  List<AuditScanEventResponse> = emptyList(),
    val foundCount:   Int = 0,
    val unknownCount: Int = 0,
    val queuedCount:  Int = 0,
    val lastMessage:  String? = null,
    val error:        String? = null,
    val report:       AuditReportResponse? = null,
)

@HiltViewModel
class AuditRunViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val scanner: ScannerService,
    private val queuedScanDao: QueuedScanDao,
    private val syncScheduler: ScanSyncScheduler,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val campaignId: String = savedStateHandle["campaignId"] ?: ""

    private val _state = MutableStateFlow(AuditRunUiState(campaignId = campaignId))
    val state: StateFlow<AuditRunUiState> = _state

    val pendingCount: StateFlow<Int> = queuedScanDao
        .pendingCountByCampaign(campaignId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    init {
        viewModelScope.launch {
            scanner.scanResults.collect { result -> submitTag(result.value) }
        }
    }

    fun triggerScan() = scanner.startScan()

    /**
     * Offline-first: write the scan to the local queue immediately, then try to
     * send to the API. On any failure we leave it in the queue for WorkManager
     * to drain when connectivity returns.
     */
    fun submitTag(tag: String) {
        val trimmed = tag.trim()
        if (trimmed.isBlank() || campaignId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            val queueId = queuedScanDao.insert(
                QueuedScan(campaignId = campaignId, tagValue = trimmed),
            )
            try {
                val ev = api.recordAuditScan(
                    campaignId,
                    com.vairiot.app.data.api.RecordScanRequest(tagValue = trimmed),
                )
                queuedScanDao.deleteById(queueId)
                val recents = (listOf(ev) + _state.value.recentScans).take(20)
                val foundDelta   = if (ev.result == "found")   1 else 0
                val unknownDelta = if (ev.result == "unknown") 1 else 0
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    recentScans  = recents,
                    foundCount   = _state.value.foundCount   + foundDelta,
                    unknownCount = _state.value.unknownCount + unknownDelta,
                    lastMessage  = if (ev.result == "found") "Recorded: $trimmed" else "Unknown tag: $trimmed",
                )
            } catch (e: Exception) {
                syncScheduler.triggerNow()
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    lastMessage  = "Queued offline: $trimmed",
                )
            }
        }
    }

    fun complete() {
        if (campaignId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            try {
                val report = api.completeAudit(campaignId)
                _state.value = _state.value.copy(isSubmitting = false, report = report)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    error = "Could not complete audit: ${e.message}",
                )
            }
        }
    }

    fun clearMessage() {
        _state.value = _state.value.copy(lastMessage = null, error = null)
    }
}
