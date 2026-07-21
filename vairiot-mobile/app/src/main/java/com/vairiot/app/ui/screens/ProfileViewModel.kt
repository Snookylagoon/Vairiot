package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.UserProfileResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.sync.AssetSyncScheduler
import com.vairiot.app.sync.ScanSyncScheduler
import com.vairiot.app.update.MobileVersionResponse
import com.vairiot.app.update.UpdateCheckResult
import com.vairiot.app.update.UpdateChecker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
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
    /** Offline queue items that exhausted their sync attempts (scans + assets). */
    val failedSyncCount: Int = 0,
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
    private val scanSyncScheduler:  ScanSyncScheduler,
    private val assetSyncScheduler: AssetSyncScheduler,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    init {
        load()
        viewModelScope.launch {
            combine(queuedScanDao.deadCount(), queuedAssetDao.deadCount()) { s, a -> s + a }
                .collect { total -> _state.value = _state.value.copy(failedSyncCount = total) }
        }
    }

    /** Re-queue all failed offline items and kick a sync immediately. */
    fun retryFailedSync() {
        viewModelScope.launch {
            queuedScanDao.retryAllDead()
            queuedAssetDao.retryAllDead()
            scanSyncScheduler.triggerNow()
            assetSyncScheduler.triggerNow()
        }
    }

    /** Permanently discard all failed offline items (user-confirmed in the UI). */
    fun discardFailedSync() {
        viewModelScope.launch {
            queuedScanDao.discardAllDead()
            queuedAssetDao.discardAllDead()
        }
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
                // flows (failedSyncCount from deadCount(), update state) survive.
                // A fresh object reset failedSyncCount to 0, and since deadCount()
                // doesn't re-emit an unchanged value, the "Failed sync items" card
                // vanished the moment the profile finished loading.
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
