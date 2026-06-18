package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AssetDetailUiState {
    object Loading : AssetDetailUiState()
    data class Loaded(val asset: AssetResponse) : AssetDetailUiState()
    data class Error(val message: String) : AssetDetailUiState()
}

@HiltViewModel
class AssetDetailViewModel @Inject constructor(
    private val api: VairiotApiService,
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
                _state.value = AssetDetailUiState.Loaded(api.getAsset(assetId))
            } catch (e: Exception) {
                _state.value = AssetDetailUiState.Error(e.message ?: "Could not load asset")
            }
        }
    }
}
