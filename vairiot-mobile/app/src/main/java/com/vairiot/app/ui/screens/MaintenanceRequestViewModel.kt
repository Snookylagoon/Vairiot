package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.MaintenanceCreateRequest
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject

data class MaintenanceRequestUiState(
    val maintenanceType: String = "repair",
    val notes:           String = "",
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

    fun setType(type: String)   { _state.value = _state.value.copy(maintenanceType = type) }
    fun setNotes(notes: String) { _state.value = _state.value.copy(notes = notes.take(2000)) }
    fun setPhoto(uri: Uri?)     { _state.value = _state.value.copy(photoUri = uri) }
    fun clearError()            { _state.value = _state.value.copy(error = null) }
    fun clearLastWorkOrder()    { _state.value = _state.value.copy(lastWorkOrder = null) }

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

    private suspend fun uploadPhoto(uri: Uri, maintenanceEventId: String) {
        val bytes = context.contentResolver.openInputStream(uri).use { it?.readBytes() }
            ?: return
        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
        val part = MultipartBody.Part.createFormData("photo", "maintenance.jpg", body)
        api.uploadMaintenancePhoto(maintenanceEventId, part)
    }
}
