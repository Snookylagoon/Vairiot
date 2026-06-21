package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.ImageCompressor
import com.vairiot.app.data.api.MaintenanceCreateRequest
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

data class MaintenanceRequestUiState(
    val maintenanceType: String = "repair",
    val notes:           String = "",
    val scheduledDate:   Long?  = null,   // epoch millis (UTC start of day)
    val photoUri:        Uri?   = null,
    val isSubmitting:    Boolean = false,
    val error:           String? = null,
    val lastWorkOrder:   String? = null,
)

@HiltViewModel
class MaintenanceRequestViewModel @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(MaintenanceRequestUiState())
    val state: StateFlow<MaintenanceRequestUiState> = _state

    fun setType(type: String)            { _state.value = _state.value.copy(maintenanceType = type) }
    fun setNotes(notes: String)          { _state.value = _state.value.copy(notes = notes.take(2000)) }
    fun setScheduledDate(epochMs: Long?) { _state.value = _state.value.copy(scheduledDate = epochMs) }
    fun setPhoto(uri: Uri?)              { _state.value = _state.value.copy(photoUri = uri) }
    fun clearError()                     { _state.value = _state.value.copy(error = null) }
    fun clearLastWorkOrder()             { _state.value = _state.value.copy(lastWorkOrder = null) }

    fun submit() {
        if (assetId.isBlank()) return
        val s = _state.value
        if (s.notes.isBlank()) {
            _state.value = s.copy(error = "Please describe what needs doing.")
            return
        }
        viewModelScope.launch {
            _state.value = s.copy(isSubmitting = true, error = null)
            try {
                val event = api.createMaintenanceEvent(
                    MaintenanceCreateRequest(
                        assetId         = assetId,
                        maintenanceType = s.maintenanceType,
                        description     = s.notes.lines().firstOrNull()?.take(120),
                        notes           = s.notes,
                        status          = "scheduled",
                        scheduledDate   = s.scheduledDate?.let(::epochMillisToIsoDate),
                    ),
                )
                s.photoUri?.let { uploadPhoto(it, event.id) }
                _state.value = MaintenanceRequestUiState(lastWorkOrder = event.workOrderNumber)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    error = "Could not submit: ${e.message}",
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

    private suspend fun uploadPhoto(uri: Uri, maintenanceEventId: String) {
        val result = withContext(Dispatchers.IO) {
            ImageCompressor.compress(context, uri, assetRef = assetId)
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
