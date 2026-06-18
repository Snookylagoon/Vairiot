package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AssetUpdateRequest
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AssetEditUiState(
    val isLoading:   Boolean = false,
    val isSaving:    Boolean = false,
    val error:       String? = null,
    val savedAsset:  AssetResponse? = null,

    val name:         String = "",
    val description:  String = "",
    val status:       String = "active",
    val condition:    String = "good",
    val serialNumber: String = "",
    val barcode:      String = "",
    val rfidTag:      String = "",
)

@HiltViewModel
class AssetEditViewModel @Inject constructor(
    private val api: VairiotApiService,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(AssetEditUiState())
    val state: StateFlow<AssetEditUiState> = _state

    init { load() }

    fun load() {
        if (assetId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val a = api.getAsset(assetId)
                _state.value = _state.value.copy(
                    isLoading = false,
                    name         = a.name,
                    description  = a.description ?: "",
                    status       = a.status,
                    condition    = a.condition,
                    serialNumber = a.serialNumber ?: "",
                    barcode      = a.barcode ?: "",
                    rfidTag      = a.rfidTag ?: "",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun update(field: String, value: String) {
        _state.value = when (field) {
            "name"         -> _state.value.copy(name = value)
            "description"  -> _state.value.copy(description = value)
            "status"       -> _state.value.copy(status = value)
            "condition"    -> _state.value.copy(condition = value)
            "serialNumber" -> _state.value.copy(serialNumber = value)
            "barcode"      -> _state.value.copy(barcode = value)
            "rfidTag"      -> _state.value.copy(rfidTag = value)
            else           -> _state.value
        }
    }

    fun save() {
        val s = _state.value
        viewModelScope.launch {
            _state.value = s.copy(isSaving = true, error = null)
            try {
                val updated = api.updateAsset(assetId, AssetUpdateRequest(
                    name         = s.name.takeIf { it.isNotBlank() },
                    description  = s.description.takeIf { it.isNotBlank() },
                    status       = s.status.takeIf { it.isNotBlank() },
                    condition    = s.condition.takeIf { it.isNotBlank() },
                    serialNumber = s.serialNumber.takeIf { it.isNotBlank() },
                    barcode      = s.barcode.takeIf { it.isNotBlank() },
                    rfidTag      = s.rfidTag.takeIf { it.isNotBlank() },
                ))
                _state.value = _state.value.copy(isSaving = false, savedAsset = updated)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSaving = false, error = "Save failed: ${e.message}")
            }
        }
    }
}
