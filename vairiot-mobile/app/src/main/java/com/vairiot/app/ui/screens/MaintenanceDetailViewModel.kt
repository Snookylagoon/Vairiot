package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.ImageCompressor
import com.vairiot.app.data.api.MaintenanceEventResponse
import com.vairiot.app.data.api.MaintenanceUpdateRequest
import com.vairiot.app.data.api.PhotoResponse
import com.vairiot.app.data.api.PhotoUpdateRequest
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

data class MaintenanceDetailUiState(
    val isLoading:    Boolean = true,
    val event:        MaintenanceEventResponse? = null,
    val photos:       List<PhotoResponse> = emptyList(),
    val permissions:  List<String> = emptyList(),
    val error:        String? = null,

    // Completion form
    val completionNotes: String = "",
    val isCompleting:    Boolean = false,
    val completeError:   String? = null,
    val completed:       Boolean = false,

    // Photo upload
    val isUploading: Boolean = false,
    val uploadError: String? = null,
)

@HiltViewModel
class MaintenanceDetailViewModel @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val eventId: String = savedStateHandle["eventId"] ?: ""

    private val _state = MutableStateFlow(MaintenanceDetailUiState())
    val state: StateFlow<MaintenanceDetailUiState> = _state

    init { load() }

    fun load() {
        if (eventId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val me = api.getMe()
                val event = api.getMaintenanceEvent(eventId)
                val photos = api.listMaintenancePhotos(eventId)
                _state.value = _state.value.copy(
                    isLoading = false,
                    event = event,
                    photos = photos,
                    permissions = me.permissions,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Could not load: ${e.message}",
                )
            }
        }
    }

    fun setCompletionNotes(notes: String) {
        _state.value = _state.value.copy(completionNotes = notes.take(2000))
    }

    fun completeTask() {
        val s = _state.value
        val event = s.event ?: return
        viewModelScope.launch {
            _state.value = s.copy(isCompleting = true, completeError = null)
            try {
                val notes = buildString {
                    event.notes?.let { append(it); append("\n\n") }
                    if (s.completionNotes.isNotBlank()) {
                        append("--- Completion notes ---\n")
                        append(s.completionNotes)
                    }
                }.trim().ifBlank { null }

                val updated = api.updateMaintenanceEvent(
                    eventId,
                    MaintenanceUpdateRequest(
                        status = "completed",
                        notes = notes,
                        completedDate = todayIsoDate(),
                    ),
                )
                _state.value = _state.value.copy(
                    isCompleting = false,
                    event = updated,
                    completed = true,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isCompleting = false,
                    completeError = "Could not complete: ${e.message}",
                )
            }
        }
    }

    fun startTask() {
        viewModelScope.launch {
            try {
                val updated = api.updateMaintenanceEvent(
                    eventId,
                    MaintenanceUpdateRequest(status = "in_progress"),
                )
                _state.value = _state.value.copy(event = updated)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Could not update: ${e.message}")
            }
        }
    }

    fun uploadFromUri(uri: Uri) {
        if (eventId.isBlank()) return
        val assetRef = _state.value.event?.assetId ?: eventId
        viewModelScope.launch {
            _state.value = _state.value.copy(isUploading = true, uploadError = null)
            try {
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
                api.uploadMaintenancePhoto(eventId, photoPart, thumbPart)
                result.deleteLocalFiles()
                val photos = api.listMaintenancePhotos(eventId)
                _state.value = _state.value.copy(isUploading = false, photos = photos)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isUploading = false,
                    uploadError = "Upload failed: ${e.message}",
                )
            }
        }
    }

    fun updateCaption(photoId: String, caption: String) {
        viewModelScope.launch {
            try {
                val updated = api.updatePhoto(photoId, PhotoUpdateRequest(caption.ifBlank { null }))
                _state.value = _state.value.copy(
                    photos = _state.value.photos.map { if (it.id == photoId) updated else it },
                )
            } catch (_: Exception) {}
        }
    }

    fun deletePhoto(photoId: String) {
        viewModelScope.launch {
            try {
                api.deletePhoto(photoId)
                _state.value = _state.value.copy(
                    photos = _state.value.photos.filter { it.id != photoId },
                )
            } catch (_: Exception) {}
        }
    }

    private fun todayIsoDate(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.UK).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        return fmt.format(java.util.Date())
    }
}
