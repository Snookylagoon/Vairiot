package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.Gs1Repository
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.Gs1EncodingResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AssetDetailUiState {
    object Loading : AssetDetailUiState()
    data class Loaded(val asset: AssetResponse, val gs1: Gs1EncodingResponse? = null) : AssetDetailUiState()
    data class Error(val message: String) : AssetDetailUiState()
}

@HiltViewModel
class AssetDetailViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val gs1Repository: Gs1Repository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow<AssetDetailUiState>(AssetDetailUiState.Loading)
    val state: StateFlow<AssetDetailUiState> = _state

    init { load() }

    fun load() {
        if (assetId.isBlank()) {
            _state.value = AssetDetailUiState.Error("Missing asset id"); return
        }
        viewModelScope.launch {
            _state.value = AssetDetailUiState.Loading
            try {
                val asset = api.getAsset(assetId)
                _state.value = AssetDetailUiState.Loaded(asset)
                // GS1 identity is derived, never blocking: assets that predate
                // identifier allocation simply have no card.
                val gs1 = asset.individualAssetReference?.let { iar ->
                    gs1Repository.getIdentification()?.let { ident ->
                        gs1Repository.encodeLocally(iar, asset.giai, ident)
                    }
                }
                if (gs1 != null) _state.value = AssetDetailUiState.Loaded(asset, gs1)
            } catch (e: Exception) {
                _state.value = AssetDetailUiState.Error(e.message ?: "Could not load asset")
            }
        }
    }
}
