package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.PhotoResponse
import com.vairiot.app.data.api.PhotoUpdateRequest
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

data class AssetPhotosUiState(
    val photos:     List<PhotoResponse> = emptyList(),
    val isLoading:  Boolean = false,
    val isUploading: Boolean = false,
    val error:      String? = null,
)

@HiltViewModel
class AssetPhotosViewModel @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(AssetPhotosUiState())
    val state: StateFlow<AssetPhotosUiState> = _state

    init { load() }

    fun load() {
        if (assetId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                _state.value = _state.value.copy(isLoading = false, photos = api.listAssetPhotos(assetId))
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun uploadFromUri(uri: Uri) {
        if (assetId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isUploading = true, error = null)
            try {
                val bytes = context.contentResolver.openInputStream(uri).use { it?.readBytes() }
                    ?: throw IllegalStateException("Could not read captured image")
                val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("photo", "capture.jpg", body)
                api.uploadAssetPhoto(assetId, part)
                load()
                _state.value = _state.value.copy(isUploading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isUploading = false, error = "Upload failed: ${e.message}")
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
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Caption update failed: ${e.message}")
            }
        }
    }

    fun delete(photoId: String) {
        viewModelScope.launch {
            try { api.deletePhoto(photoId); load() }
            catch (e: Exception) { _state.value = _state.value.copy(error = "Delete failed: ${e.message}") }
        }
    }
}
