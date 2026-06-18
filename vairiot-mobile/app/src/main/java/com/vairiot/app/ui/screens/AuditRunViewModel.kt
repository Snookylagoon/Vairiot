package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuditRunUiState(
    val campaignId: String = "",
    val isSubmitting: Boolean = false,
    val recentScans:  List<AuditScanEventResponse> = emptyList(),
    val foundCount:   Int = 0,
    val unknownCount: Int = 0,
    val lastMessage:  String? = null,
    val error:        String? = null,
    val report:       AuditReportResponse? = null,
)

@HiltViewModel
class AuditRunViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val scanner: ScannerService,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val campaignId: String = savedStateHandle["campaignId"] ?: ""

    private val _state = MutableStateFlow(AuditRunUiState(campaignId = campaignId))
    val state: StateFlow<AuditRunUiState> = _state

    init {
        viewModelScope.launch {
            scanner.scanResults.collect { result -> submitTag(result.value) }
        }
    }

    fun triggerScan() = scanner.startScan()

    fun submitTag(tag: String) {
        val trimmed = tag.trim()
        if (trimmed.isBlank() || campaignId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            try {
                val ev = api.recordAuditScan(campaignId, RecordScanRequest(tagValue = trimmed))
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
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    error = "Could not record scan: ${e.message}",
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
