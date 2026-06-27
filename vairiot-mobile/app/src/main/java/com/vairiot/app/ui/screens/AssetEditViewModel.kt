package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AssetUpdateRequest
import com.vairiot.app.data.api.LocationRefResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.scanner.ScanType
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AssetEditUiState(
    val isLoading:      Boolean = false,
    val isSaving:       Boolean = false,
    val error:          String? = null,
    val savedAsset:     AssetResponse? = null,
    val scanningBarcode: Boolean = false,
    val scanningRfid:    Boolean = false,

    val name:         String = "",
    val description:  String = "",
    val status:       String = "active",
    val condition:    String = "good",
    val serialNumber: String = "",
    val barcode:      String = "",
    val rfidTag:      String = "",

    val sites:        List<SiteRefResponse> = emptyList(),
    val locations:    List<LocationRefResponse> = emptyList(),
    val siteId:       String = "",
    val locationId:   String = "",
)

@HiltViewModel
class AssetEditViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val scanner: ScannerService,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(AssetEditUiState())
    val state: StateFlow<AssetEditUiState> = _state

    init {
        load()
        viewModelScope.launch {
            scanner.scanResults.collect { result ->
                val s = _state.value
                when {
                    s.scanningBarcode && result.type == ScanType.BARCODE -> {
                        _state.value = s.copy(barcode = result.value, scanningBarcode = false)
                        scanner.stopScan()
                    }
                    s.scanningRfid && result.type == ScanType.RFID_UHF -> {
                        _state.value = s.copy(rfidTag = result.value, scanningRfid = false)
                        scanner.stopScan()
                    }
                }
            }
        }
    }

    fun startBarcodeScan() {
        _state.value = _state.value.copy(scanningBarcode = true, scanningRfid = false)
        scanner.startScan(ScanType.BARCODE)
    }

    fun cancelBarcodeScan() {
        scanner.stopScan()
        _state.value = _state.value.copy(scanningBarcode = false)
    }

    fun startRfidScan() {
        _state.value = _state.value.copy(scanningRfid = true, scanningBarcode = false)
        scanner.startScan(ScanType.RFID_UHF)
    }

    fun cancelRfidScan() {
        scanner.stopScan()
        _state.value = _state.value.copy(scanningRfid = false)
    }

    fun load() {
        if (assetId.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val a = api.getAsset(assetId)
                val sites = try { api.listSites() } catch (_: Exception) { emptyList() }
                val sId = a.site?.id ?: ""
                val locs = if (sId.isNotBlank()) {
                    try { api.listSiteLocations(sId) } catch (_: Exception) { emptyList() }
                } else emptyList()
                _state.value = _state.value.copy(
                    isLoading = false,
                    name         = a.name,
                    description  = a.description ?: "",
                    status       = a.status,
                    condition    = a.condition,
                    serialNumber = a.serialNumber ?: "",
                    barcode      = a.barcode ?: "",
                    rfidTag      = a.rfidTag ?: "",
                    sites        = sites,
                    locations    = locs,
                    siteId       = sId,
                    locationId   = a.location?.id ?: "",
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
            "siteId"       -> {
                _state.value.copy(siteId = value, locationId = "", locations = emptyList())
                    .also { if (value.isNotBlank()) loadLocations(value) }
            }
            "locationId"   -> _state.value.copy(locationId = value)
            else           -> _state.value
        }
    }

    private fun loadLocations(siteId: String) {
        viewModelScope.launch {
            try {
                val locs = api.listSiteLocations(siteId)
                _state.value = _state.value.copy(locations = locs)
            } catch (_: Exception) { /* leave empty */ }
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
                    siteId       = s.siteId.takeIf { it.isNotBlank() },
                    locationId   = s.locationId.takeIf { it.isNotBlank() },
                ))
                _state.value = _state.value.copy(isSaving = false, savedAsset = updated)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSaving = false, error = "Save failed: ${e.message}")
            }
        }
    }
}
