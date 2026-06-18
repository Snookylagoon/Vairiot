package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.VairiotApiService
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
) : ViewModel() {

    private val _state = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val state: StateFlow<ScanUiState> = _state

    // Called by ScannerService when a barcode or RFID tag is scanned
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
