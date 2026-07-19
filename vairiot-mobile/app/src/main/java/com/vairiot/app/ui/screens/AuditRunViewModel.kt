package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.api.ZoneSubmissionResponse
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
    val campaign: AuditCampaignResponse? = null,
    val isBlind: Boolean = false,
    val isSubmitting: Boolean = false,
    val recentScans:  List<AuditScanEventResponse> = emptyList(),
    val foundCount:   Int = 0,
    val unknownCount: Int = 0,
    val recordedCount: Int = 0,
    val queuedCount:  Int = 0,
    val selectedLocationId: String = "",
    val locations: List<Pair<String, String>> = emptyList(),
    val zoneSubmissions: List<ZoneSubmissionResponse> = emptyList(),
    val condition: String = "",
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
        loadCampaign()
    }

    private fun loadCampaign() {
        viewModelScope.launch {
            val campaign = ensureStarted() ?: return@launch
            val isBlind = campaign.mode == "blind"
            _state.value = _state.value.copy(campaign = campaign, isBlind = isBlind)

            if (isBlind && campaign.siteId != null) {
                try {
                    val locations = api.listSiteLocations(campaign.siteId)
                    val zones = api.listAuditZones(campaignId)
                    _state.value = _state.value.copy(
                        locations = locations.map { it.id to it.name },
                        zoneSubmissions = zones,
                    )
                } catch (_: Exception) {
                    // Zones/locations will be retried on next scan attempt
                }
            }
        }
    }

    // Campaigns are created in 'draft' status; the server only accepts scans and
    // completion once a campaign is 'in_progress'. If it's already in progress
    // (e.g. resuming a partially-scanned audit), starting it conflicts, so fall
    // back to fetching its current state instead.
    private suspend fun ensureStarted(): AuditCampaignResponse? {
        return try {
            api.startAudit(campaignId)
        } catch (_: Exception) {
            try {
                api.listAudits().firstOrNull { it.id == campaignId }
            } catch (_: Exception) {
                null
            }
        }
    }

    fun triggerScan() = scanner.startScan()

    fun setSelectedLocation(locationId: String) {
        _state.value = _state.value.copy(selectedLocationId = locationId)
    }

    fun setCondition(condition: String) {
        _state.value = _state.value.copy(condition = condition)
    }

    fun isZoneLocked(locationId: String): Boolean {
        return _state.value.zoneSubmissions.any { it.locationId == locationId }
    }

    fun submitZone() {
        val locationId = _state.value.selectedLocationId
        if (locationId.isBlank() || campaignId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            try {
                val submission = api.submitAuditZone(campaignId, locationId)
                val updated = _state.value.zoneSubmissions + submission
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    zoneSubmissions = updated,
                    lastMessage = "Zone submitted and locked",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    error = "Could not submit zone: ${e.message}",
                )
            }
        }
    }

    fun submitTag(tag: String) {
        val trimmed = tag.trim()
        if (trimmed.isBlank() || campaignId.isBlank()) return

        val currentState = _state.value
        if (currentState.isBlind && currentState.selectedLocationId.isBlank()) {
            _state.value = currentState.copy(error = "Select a zone before scanning")
            return
        }
        if (currentState.isBlind && isZoneLocked(currentState.selectedLocationId)) {
            _state.value = currentState.copy(error = "This zone is locked")
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            // Persist the SAME fields the online request sends, so an offline replay
            // isn't rejected for a missing locationId (blind campaigns require it) or
            // silently stripped of its condition assessment.
            val scanLocationId = if (currentState.isBlind) currentState.selectedLocationId else null
            val scanCondition  = currentState.condition.ifBlank { null }
            val queueId = queuedScanDao.insert(
                QueuedScan(
                    campaignId = campaignId,
                    tagValue = trimmed,
                    locationId = scanLocationId,
                    condition = scanCondition,
                ),
            )
            try {
                val request = RecordScanRequest(
                    tagValue = trimmed,
                    locationId = scanLocationId,
                    condition = scanCondition,
                )
                val ev = api.recordAuditScan(campaignId, request)
                queuedScanDao.deleteById(queueId)
                val recents = (listOf(ev) + _state.value.recentScans).take(20)
                val foundDelta    = if (ev.result == "found")    1 else 0
                val unknownDelta  = if (ev.result == "unknown")  1 else 0
                val recordedDelta = if (ev.result == "recorded") 1 else 0
                _state.value = _state.value.copy(
                    isSubmitting  = false,
                    recentScans   = recents,
                    foundCount    = _state.value.foundCount   + foundDelta,
                    unknownCount  = _state.value.unknownCount + unknownDelta,
                    recordedCount = _state.value.recordedCount + recordedDelta,
                    condition     = "",
                    lastMessage   = if (ev.result == "recorded") "Recorded: $trimmed"
                                    else if (ev.result == "found") "Recorded: $trimmed"
                                    else "Unknown tag: $trimmed",
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
