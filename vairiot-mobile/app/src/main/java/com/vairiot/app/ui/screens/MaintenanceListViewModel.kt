package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.ImageCompressor
import com.vairiot.app.data.api.MaintenanceCreateRequest
import com.vairiot.app.data.api.MaintenanceEventResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import javax.inject.Inject

data class MaintenanceListUiState(
    val isLoading:   Boolean = false,
    val events:      List<MaintenanceEventResponse> = emptyList(),
    val total:       Int = 0,
    val page:        Int = 1,
    val totalPages:  Int = 1,
    val error:       String? = null,
    val permissions: List<String> = emptyList(),

    // Report form
    val showReportForm: Boolean = false,
    val reportAssetId:  String = "",
    val reportType:     String = "repair",
    val reportNotes:    String = "",
    val reportScheduledDate: Long? = null,
    val reportPhotoUri: Uri? = null,
    val isSubmitting:   Boolean = false,
    val submitError:    String? = null,
    val lastWorkOrder:  String? = null,

    // Asset search for report form
    val assetSearchQuery:   String = "",
    val assetSearchResults: List<AssetSearchResult> = emptyList(),
    val isSearchingAssets:  Boolean = false,
)

data class AssetSearchResult(
    val id:          String,
    val assetNumber: String,
    val name:        String,
)

@HiltViewModel
class MaintenanceListViewModel @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(MaintenanceListUiState())
    val state: StateFlow<MaintenanceListUiState> = _state

    val canWrite: Boolean get() = _state.value.permissions.contains("asset:write")

    init { load() }

    fun load(statusFilter: String? = null) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val me = api.getMe()
                val result = api.listMaintenanceEvents(
                    status = statusFilter,
                    sortBy = "scheduledDate",
                    sortOrder = "asc",
                )
                _state.value = _state.value.copy(
                    isLoading = false,
                    events = result.events,
                    total = result.total,
                    page = result.page,
                    totalPages = result.totalPages,
                    permissions = me.permissions,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Could not load maintenance: ${e.message}",
                )
            }
        }
    }

    // ─── Report form ───────────────────────────────────────────────────────

    fun showReportForm()  { _state.value = _state.value.copy(showReportForm = true, lastWorkOrder = null) }
    fun hideReportForm()  { _state.value = _state.value.copy(showReportForm = false, submitError = null) }
    fun setReportType(t: String)     { _state.value = _state.value.copy(reportType = t) }
    fun setReportNotes(n: String)    { _state.value = _state.value.copy(reportNotes = n.take(2000)) }
    fun setReportScheduledDate(ms: Long?) { _state.value = _state.value.copy(reportScheduledDate = ms) }
    fun setReportPhoto(uri: Uri?)    { _state.value = _state.value.copy(reportPhotoUri = uri) }
    fun clearLastWorkOrder()         { _state.value = _state.value.copy(lastWorkOrder = null) }

    fun searchAssets(query: String) {
        _state.value = _state.value.copy(assetSearchQuery = query)
        if (query.length < 2) {
            _state.value = _state.value.copy(assetSearchResults = emptyList())
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSearchingAssets = true)
            try {
                val result = api.listAssets(search = query, pageSize = 10)
                _state.value = _state.value.copy(
                    isSearchingAssets = false,
                    assetSearchResults = result.assets.map {
                        AssetSearchResult(it.id, it.assetNumber, it.name)
                    },
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(isSearchingAssets = false)
            }
        }
    }

    fun selectReportAsset(asset: AssetSearchResult) {
        _state.value = _state.value.copy(
            reportAssetId = asset.id,
            assetSearchQuery = "${asset.assetNumber} — ${asset.name}",
            assetSearchResults = emptyList(),
        )
    }

    fun submitReport() {
        val s = _state.value
        if (s.reportAssetId.isBlank()) {
            _state.value = s.copy(submitError = "Please select an asset.")
            return
        }
        if (s.reportNotes.isBlank()) {
            _state.value = s.copy(submitError = "Please describe what needs doing.")
            return
        }
        viewModelScope.launch {
            _state.value = s.copy(isSubmitting = true, submitError = null)
            try {
                val event = api.createMaintenanceEvent(
                    MaintenanceCreateRequest(
                        assetId         = s.reportAssetId,
                        maintenanceType = s.reportType,
                        description     = s.reportNotes.lines().firstOrNull()?.take(120),
                        notes           = s.reportNotes,
                        status          = "scheduled",
                        scheduledDate   = s.reportScheduledDate?.let(::epochMillisToIsoDate),
                    ),
                )
                s.reportPhotoUri?.let { uploadPhoto(it, event.id, s.reportAssetId) }
                _state.value = MaintenanceListUiState(
                    permissions = s.permissions,
                    lastWorkOrder = event.workOrderNumber,
                )
                load()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    submitError = "Could not submit: ${e.message}",
                )
            }
        }
    }

    private fun epochMillisToIsoDate(ms: Long): String {
        val d = java.util.Date(ms)
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.UK).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        return fmt.format(d)
    }

    private suspend fun uploadPhoto(uri: Uri, maintenanceEventId: String, assetRef: String) {
        val result = withContext(Dispatchers.IO) {
            ImageCompressor.compress(context, uri, assetRef = assetRef)
        }
        val photoPart = MultipartBody.Part.createFormData(
            "photo", result.displayFile.name,
            result.displayFile.asRequestBody("image/webp".toMediaTypeOrNull()),
        )
        val thumbPart = MultipartBody.Part.createFormData(
            "thumb", result.thumbFile.name,
            result.thumbFile.asRequestBody("image/webp".toMediaTypeOrNull()),
        )
        api.uploadMaintenancePhoto(maintenanceEventId, photoPart, thumbPart)
        result.deleteLocalFiles()
    }
}
