package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.UserProfileResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueueState
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.StateCount
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.sync.AssetSyncScheduler
import com.vairiot.app.sync.PhotoSyncScheduler
import com.vairiot.app.sync.ScanSyncScheduler
import com.vairiot.app.sync.deletePhotoFiles
import com.vairiot.app.update.MobileVersionResponse
import com.vairiot.app.update.UpdateCheckResult
import com.vairiot.app.update.UpdateChecker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val isLoading:       Boolean = true,
    val email:           String? = null,
    val tenantId:        String? = null,
    val tenantName:      String? = null,
    val roles:           List<String> = emptyList(),
    val licenceNumber:   String? = null,
    val licenceTier:     String? = null,
    val licenceStatus:   String? = null,
    val licenceStart:    String? = null,
    val offline:         Boolean = false,
    val error:           String? = null,
    val update:          UpdateUiState = UpdateUiState.Idle,
)

enum class QueueKind { SCAN, ASSET, PHOTO }

/** Rows of one offline queue by state. */
data class QueueCounts(val pending: Int = 0, val failed: Int = 0, val dead: Int = 0) {
    val total get() = pending + failed + dead
}

/** A row the server rejected, shown with its reason so the user can retry or discard it. */
data class DeadUpload(val kind: QueueKind, val id: Long, val label: String, val error: String?)

data class PendingUploads(
    val scans:  QueueCounts = QueueCounts(),
    val assets: QueueCounts = QueueCounts(),
    val photos: QueueCounts = QueueCounts(),
    val dead:   List<DeadUpload> = emptyList(),
) {
    val total get() = scans.total + assets.total + photos.total
}

private fun List<StateCount>.toCounts() = QueueCounts(
    pending = firstOrNull { it.state == QueueState.PENDING }?.count ?: 0,
    failed  = firstOrNull { it.state == QueueState.FAILED }?.count ?: 0,
    dead    = firstOrNull { it.state == QueueState.DEAD }?.count ?: 0,
)

/** State machine for the "Check for updates" control in the App version card. */
sealed interface UpdateUiState {
    object Idle : UpdateUiState
    /** A version check is in flight. */
    object Checking : UpdateUiState
    /** An update was found; show the Install / Not now dialog. */
    data class Available(val info: MobileVersionResponse) : UpdateUiState
    /** The APK is being downloaded before the system installer opens. */
    data class Downloading(val info: MobileVersionResponse) : UpdateUiState
    /** Already on the latest release. */
    object UpToDate : UpdateUiState
    /** The check could not be completed (offline / server error). */
    object Failed : UpdateUiState
    /** The user chose "Not now"; the update will arrive on next sign in. */
    object Deferred : UpdateUiState
    /** Download/install failed after the user tapped Install. */
    object InstallFailed : UpdateUiState
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val api:           VairiotApiService,
    private val tokenStore:    TokenStore,
    private val updateChecker: UpdateChecker,
    private val queuedScanDao:  QueuedScanDao,
    private val queuedAssetDao: QueuedAssetDao,
    private val queuedPhotoDao: QueuedPhotoDao,
    private val scanSyncScheduler:  ScanSyncScheduler,
    private val assetSyncScheduler: AssetSyncScheduler,
    private val photoSyncScheduler: PhotoSyncScheduler,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    /**
     * Everything still on the device's offline queues. Kept apart from
     * [ProfileUiState] so profile loads can never overwrite it.
     */
    val pendingUploads: StateFlow<PendingUploads> = combine(
        combine(
            queuedScanDao.countsByState(),
            queuedAssetDao.countsByState(),
            queuedPhotoDao.countsByState(),
        ) { s, a, p -> Triple(s.toCounts(), a.toCounts(), p.toCounts()) },
        combine(
            queuedScanDao.deadItems(),
            queuedAssetDao.deadItems(),
            queuedPhotoDao.deadItems(),
        ) { s, a, p ->
            s.map { DeadUpload(QueueKind.SCAN, it.id, "Audit scan ${it.tagValue}", it.lastError) } +
                a.map { DeadUpload(QueueKind.ASSET, it.id, "New asset \"${it.name}\"", it.lastError) } +
                p.map { DeadUpload(QueueKind.PHOTO, it.id, "Asset photo", it.lastError) }
        },
    ) { (scans, assets, photos), dead -> PendingUploads(scans, assets, photos, dead) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PendingUploads())

    init {
        load()
    }

    private fun triggerSync() {
        assetSyncScheduler.triggerNow()
        scanSyncScheduler.triggerNow()
        photoSyncScheduler.triggerNow()
    }

    /** Send a rejected row again (e.g. after the cause was fixed on the server). */
    fun retryUpload(item: DeadUpload) {
        viewModelScope.launch {
            when (item.kind) {
                QueueKind.SCAN  -> queuedScanDao.retryDead(item.id)
                QueueKind.ASSET -> queuedAssetDao.retryDead(item.id)
                QueueKind.PHOTO -> queuedPhotoDao.retryDead(item.id)
            }
            triggerSync()
        }
    }

    fun retryAllRejected() {
        viewModelScope.launch {
            queuedScanDao.retryAllDead()
            queuedAssetDao.retryAllDead()
            queuedPhotoDao.retryAllDead()
            triggerSync()
        }
    }

    /** Also kicks rows waiting on a transient failure, instead of waiting for backoff. */
    fun syncNow() = triggerSync()

    /** Permanently delete one rejected row. The UI confirms before calling this. */
    fun discardUpload(item: DeadUpload) {
        viewModelScope.launch {
            when (item.kind) {
                QueueKind.SCAN  -> queuedScanDao.discardDead(item.id)
                QueueKind.ASSET -> queuedAssetDao.discardDead(item.id)
                QueueKind.PHOTO -> discardPhoto(item.id)
            }
        }
    }

    /** Permanently delete every rejected row. The UI confirms before calling this. */
    fun discardAllRejected() {
        viewModelScope.launch {
            queuedScanDao.discardAllDead()
            queuedAssetDao.discardAllDead()
            queuedPhotoDao.deadItemsOnce().forEach { discardPhoto(it.id) }
        }
    }

    private suspend fun discardPhoto(id: Long) {
        val photo = queuedPhotoDao.getById(id) ?: return
        if (photo.state != QueueState.DEAD) return
        queuedPhotoDao.discardDead(id)
        deletePhotoFiles(photo)
    }

    /** Triggered by the "Check for updates" button. */
    fun checkForUpdates() {
        if (_state.value.update is UpdateUiState.Checking ||
            _state.value.update is UpdateUiState.Downloading) return
        viewModelScope.launch {
            _state.value = _state.value.copy(update = UpdateUiState.Checking)
            val next = when (val result = updateChecker.checkForUpdate()) {
                is UpdateCheckResult.Available -> UpdateUiState.Available(result.info)
                UpdateCheckResult.UpToDate     -> UpdateUiState.UpToDate
                UpdateCheckResult.Failed       -> UpdateUiState.Failed
            }
            _state.value = _state.value.copy(update = next)
        }
    }

    /** User tapped "Install" in the update dialog — download now, then the OS installs. */
    fun installUpdate() {
        val info = (_state.value.update as? UpdateUiState.Available)?.info ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(update = UpdateUiState.Downloading(info))
            val ok = updateChecker.downloadAndInstall(info)
            // On success the system installer takes over; surface only failures here.
            _state.value = _state.value.copy(
                update = if (ok) UpdateUiState.Idle else UpdateUiState.InstallFailed,
            )
        }
    }

    /** User tapped "Not now" — apply the update automatically on their next sign in. */
    fun deferUpdate() {
        val info = (_state.value.update as? UpdateUiState.Available)?.info
        if (info != null) updateChecker.deferToNextSignIn(info)
        _state.value = _state.value.copy(update = UpdateUiState.Deferred)
    }

    /** Dismiss any transient update message (up to date / failed / deferred). */
    fun dismissUpdateMessage() {
        _state.value = _state.value.copy(update = UpdateUiState.Idle)
    }

    fun load() {
        viewModelScope.launch {
            // Show cached licence immediately, then try the network.
            val cached = tokenStore.getCachedLicence()
            _state.value = _state.value.copy(
                licenceNumber = cached.number,
                licenceTier   = cached.tier,
                licenceStatus = cached.status,
                licenceStart  = cached.startDate,
            )

            try {
                val me: UserProfileResponse = api.getMe()
                val licence = api.getLicenceStatus()
                tokenStore.saveLicence(licence.licenceNumber, licence.tierDisplayName, licence.status, licence.activatedAt)
                // copy() — NOT a fresh ProfileUiState — so fields owned by other
                // flows (update state) survive. A fresh object once wiped the
                // failed-sync count; pending uploads now live in their own flow.
                _state.value = _state.value.copy(
                    isLoading     = false,
                    email         = me.email,
                    tenantId      = me.tenantId,
                    tenantName    = me.tenantName,
                    roles         = me.roles,
                    licenceNumber = licence.licenceNumber,
                    licenceTier   = licence.tierDisplayName,
                    licenceStatus = licence.status,
                    licenceStart  = licence.activatedAt,
                    offline       = false,
                    error         = null,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    offline   = cached.number != null,
                    error     = if (cached.number == null) "Could not load profile: ${e.message}" else null,
                )
            }
        }
    }
}
