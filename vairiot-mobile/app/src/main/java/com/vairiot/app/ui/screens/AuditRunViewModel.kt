package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.ImageCompressor
import com.vairiot.app.data.FeatureFlags
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.api.ZoneSubmissionResponse
import com.vairiot.app.data.local.QueuedPhoto
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.QueuedScan
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.location.GeoFix
import com.vairiot.app.location.PositionProvider
import com.vairiot.app.location.ScanPositionTracker
import com.vairiot.app.scanner.ScannerService
import com.vairiot.app.sync.AuditScanRecorder
import com.vairiot.app.sync.PhotoSyncScheduler
import com.vairiot.app.sync.ScanSyncScheduler
import com.vairiot.app.sync.scanSender
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
    /** The scan photos attach to (stage 1.8); null after a rejected scan. */
    val lastScan:     LastScan? = null,
)

/** Key, tag and device fix of the most recent accepted or queued scan. */
data class LastScan(val clientRequestId: String, val tagValue: String, val fix: GeoFix?)

@HiltViewModel
class AuditRunViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val scanner: ScannerService,
    private val queuedScanDao: QueuedScanDao,
    private val syncScheduler: ScanSyncScheduler,
    positions: PositionProvider,
    private val featureFlags: FeatureFlags,
    private val photoDao: QueuedPhotoDao,
    private val photoSyncScheduler: PhotoSyncScheduler,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    /** Recent device fix for each scan, kept only while GIS is on (D7, stage 1.5). */
    private val positionTracker = ScanPositionTracker(positions)

    /** GIS on for the tenant; the screen asks for location permission once when it is. */
    val gisEnabled: StateFlow<Boolean> = featureFlags.isEnabled(FeatureFlags.GIS)
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val campaignId: String = savedStateHandle["campaignId"] ?: ""

    private val _state = MutableStateFlow(AuditRunUiState(campaignId = campaignId))

    private val recorder = AuditScanRecorder(queuedScanDao, api.scanSender()) {
        syncScheduler.triggerNow()
    }
    val state: StateFlow<AuditRunUiState> = _state

    val pendingCount: StateFlow<Int> = queuedScanDao
        .pendingCountByCampaign(campaignId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    // Scans persisted locally but not yet accepted by the server (offline queue).
    // Surfaced on the Run audit screen so the user can see work awaiting upload.
    val pendingScans: StateFlow<List<QueuedScan>> = queuedScanDao
        .pendingByCampaign(campaignId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch {
            scanner.scanResults.collect { result -> submitTag(result.value) }
        }
        viewModelScope.launch { featureFlags.refresh() }
        viewModelScope.launch {
            gisEnabled.collect { on -> if (on) positionTracker.start(viewModelScope) else positionTracker.stop() }
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
            // Blind campaigns require locationId; condition is optional. The
            // recorder queues these same fields, so an offline replay is
            // identical to the online request (including its clientRequestId).
            val scanKey = UUID.randomUUID().toString()
            val fix = if (gisEnabled.value) positionTracker.latest() else null
            val outcome = recorder.record(
                campaignId = campaignId,
                tagValue   = trimmed,
                locationId = if (currentState.isBlind) currentState.selectedLocationId else null,
                condition  = currentState.condition.ifBlank { null },
                fix        = fix,
                clientRequestId = scanKey,
            )
            _state.value = when (outcome) {
                is AuditScanRecorder.Outcome.Recorded -> {
                    val ev = outcome.event
                    val recents = (listOf(ev) + _state.value.recentScans).take(20)
                    val foundDelta    = if (ev.result == "found")    1 else 0
                    val unknownDelta  = if (ev.result == "unknown")  1 else 0
                    val recordedDelta = if (ev.result == "recorded") 1 else 0
                    _state.value.copy(
                        isSubmitting  = false,
                        recentScans   = recents,
                        foundCount    = _state.value.foundCount   + foundDelta,
                        unknownCount  = _state.value.unknownCount + unknownDelta,
                        recordedCount = _state.value.recordedCount + recordedDelta,
                        condition     = "",
                        lastMessage   = if (ev.result == "unknown") "Unknown tag: $trimmed"
                                        else "Recorded: $trimmed",
                    )
                }
                AuditScanRecorder.Outcome.AlreadyRecorded -> _state.value.copy(
                    isSubmitting = false,
                    condition    = "",
                    lastMessage  = "Already recorded: $trimmed",
                )
                AuditScanRecorder.Outcome.Queued -> _state.value.copy(
                    isSubmitting = false,
                    condition    = "",
                    lastMessage  = "Queued offline: $trimmed",
                )
                // Previously every failure read "Queued offline", so a scan the
                // server refused (e.g. campaign already completed) looked saved.
                is AuditScanRecorder.Outcome.Rejected -> _state.value.copy(
                    isSubmitting = false,
                    error        = "Scan not accepted: ${outcome.message}. It is kept under Profile → Pending uploads.",
                )
            }
            _state.value = _state.value.copy(
                lastScan = if (outcome is AuditScanRecorder.Outcome.Rejected) null else LastScan(scanKey, trimmed, fix),
            )
        }
    }

    /**
     * Queues a photo against the last scan (stage 1.8). It always goes through
     * the queue: the worker sends it once the scan itself is on the server.
     * The compressed WebP has no EXIF, so the scan's fix and the capture time
     * travel as fields.
     */
    fun addPhotoToLastScan(uri: Uri) {
        val scan = _state.value.lastScan ?: return
        viewModelScope.launch {
            val result = try {
                withContext(Dispatchers.IO) { ImageCompressor.compress(context, uri, assetRef = "scan") }
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Could not read photo: ${e.message}")
                return@launch
            }
            photoDao.insert(QueuedPhoto(
                filePath = result.displayFile.absolutePath,
                thumbPath = result.thumbFile.absolutePath,
                campaignId = campaignId,
                scanClientRequestId = scan.clientRequestId,
                photoType = "inventory",
                latitude = scan.fix?.latitude,
                longitude = scan.fix?.longitude,
                geoAccuracyMeters = scan.fix?.accuracyMeters,
            ))
            photoSyncScheduler.triggerNow()
            _state.value = _state.value.copy(lastMessage = "Photo saved for ${scan.tagValue}; it uploads after the scan")
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
