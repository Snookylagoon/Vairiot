package com.vairiot.app.ui.screens

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.ImageCompressor
import com.vairiot.app.data.api.PhotoResponse
import com.vairiot.app.data.api.PhotoUpdateRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedPhoto
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.sync.PhotoSyncScheduler
import com.vairiot.app.sync.SyncFailureKind
import com.vairiot.app.sync.classifySyncFailure
import com.vairiot.app.sync.deletePhotoFiles
import com.vairiot.app.sync.photoUploader
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class AssetPhotosUiState(
    val photos:     List<PhotoResponse> = emptyList(),
    val isLoading:  Boolean = false,
    val isUploading: Boolean = false,
    val error:      String? = null,
    /** Non-error feedback, e.g. "saved, will upload when back online". */
    val notice:     String? = null,
)

@HiltViewModel
class AssetPhotosViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val photoDao: QueuedPhotoDao,
    private val photoSyncScheduler: PhotoSyncScheduler,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(AssetPhotosUiState())
    val state: StateFlow<AssetPhotosUiState> = _state

    /** Photos of this asset saved on the device but not yet on the server. */
    val pendingPhotoCount: StateFlow<Int> = photoDao
        .pendingCountForAsset(assetId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private val uploader = api.photoUploader()

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
            _state.value = _state.value.copy(isUploading = true, error = null, notice = null)
            // Compressed files land in filesDir/photos, which survives restarts.
            val result = try {
                withContext(Dispatchers.IO) {
                    ImageCompressor.compress(context, uri, assetRef = assetId)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(isUploading = false, error = "Could not read photo: ${e.message}")
                return@launch
            }
            // Queue first, then try: if the app dies mid-upload, or there is no
            // signal, the photo is already on the queue instead of being lost.
            val draft = QueuedPhoto(
                filePath  = result.displayFile.absolutePath,
                thumbPath = result.thumbFile.absolutePath,
                assetId   = assetId,
            )
            val queued = draft.copy(id = photoDao.insert(draft))
            try {
                uploader.upload(assetId, result.displayFile, result.thumbFile)
                photoDao.deleteById(queued.id)
                deletePhotoFiles(queued)
                load()
                _state.value = _state.value.copy(isUploading = false)
            } catch (e: Exception) {
                val failure = classifySyncFailure(e)
                when (failure.kind) {
                    SyncFailureKind.DUPLICATE -> {
                        photoDao.deleteById(queued.id)
                        deletePhotoFiles(queued)
                        load()
                        _state.value = _state.value.copy(isUploading = false)
                    }
                    SyncFailureKind.NETWORK, SyncFailureKind.TRANSIENT, SyncFailureKind.AUTH -> {
                        if (failure.kind != SyncFailureKind.AUTH) photoDao.markFailed(queued.id, failure.message)
                        photoSyncScheduler.triggerNow()
                        _state.value = _state.value.copy(
                            isUploading = false,
                            notice = "Photo saved on this device. It will upload automatically when back online.",
                        )
                    }
                    SyncFailureKind.PERMANENT -> {
                        photoDao.markDead(queued.id, failure.message)
                        _state.value = _state.value.copy(
                            isUploading = false,
                            error = "Upload rejected: ${failure.message}. Kept under Profile → Pending uploads.",
                        )
                    }
                }
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
