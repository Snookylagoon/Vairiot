package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ScanUiState {
    object Idle    : ScanUiState()
    object Scanning: ScanUiState()
    object Loading : ScanUiState()
    data class Found(val asset: AssetResponse) : ScanUiState()
    data class NotFound(val tag: String)       : ScanUiState()
    data class Error(val message: String)      : ScanUiState()
}

@HiltViewModel
class AssetScanViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val scanner: ScannerService,
) : ViewModel() {

    private val _state = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val state: StateFlow<ScanUiState> = _state

    init {
        viewModelScope.launch {
            scanner.scanResults.collect { result ->
                onTagScanned(result.value)
            }
        }
    }

    fun triggerScan() {
        _state.value = ScanUiState.Scanning
        scanner.startScan()
    }

    fun onTagScanned(tagValue: String) {
        viewModelScope.launch {
            _state.value = ScanUiState.Loading
            try {
                val asset = api.getAssetByTag(tagValue)
                _state.value = ScanUiState.Found(asset)
            } catch (e: Exception) {
                _state.value = ScanUiState.NotFound(tagValue)
            }
        }
    }

    fun lookupManual(query: String) = onTagScanned(query)

    fun reset() { _state.value = ScanUiState.Idle }
}
