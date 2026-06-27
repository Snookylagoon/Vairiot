package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.AssetRepository
import com.vairiot.app.data.TagLookup
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.scanner.ScanResult
import com.vairiot.app.scanner.ScanType
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class SortField(val apiKey: String, val label: String) {
    NAME("name", "Name"),
    ASSET_NUMBER("assetNumber", "Asset #"),
    STATUS("status", "Status"),
    CONDITION("condition", "Condition"),
    CREATED("createdAt", "Created"),
}

enum class SortDir(val apiKey: String) { ASC("asc"), DESC("desc") }

data class AssetListUiState(
    val isLoading: Boolean = false,
    val assets:    List<AssetResponse> = emptyList(),
    val search:    String = "",
    val status:    String = "",
    val condition: String = "",
    val sortField: SortField = SortField.NAME,
    val sortDir:   SortDir = SortDir.ASC,
    val total:     Int = 0,
    val offline:   Boolean = false,
    val error:     String? = null,
    val isScanning: Boolean = false,
    val scanError:  String? = null,
    val showCamera: Boolean = false,
)

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class AssetListViewModel @Inject constructor(
    private val repo: AssetRepository,
    private val scanner: ScannerService,
) : ViewModel() {

    private val _state = MutableStateFlow(AssetListUiState())
    val state: StateFlow<AssetListUiState> = _state

    val supportsRfid: Boolean get() = scanner.supportsRfid
    val supportsBarcode: Boolean get() = scanner.supportsBarcode
    val supportsCameraScan: Boolean get() = scanner.supportsCameraScan

    private val searchQuery = MutableStateFlow("")
    private val statusFilter = MutableStateFlow("")
    private val conditionFilter = MutableStateFlow("")
    private val sortFieldFlow = MutableStateFlow(SortField.NAME)
    private val sortDirFlow = MutableStateFlow(SortDir.ASC)
    private var searchJob: Job? = null
    private var scanTimeoutJob: Job? = null

    private val localAssets: StateFlow<List<AssetResponse>> = searchQuery
        .flatMapLatest { repo.observeAssets(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            combine(localAssets, statusFilter, conditionFilter, sortFieldFlow, sortDirFlow) { assets, status, condition, field, dir ->
                val filtered = assets
                    .filter { a -> status.isBlank() || a.status.equals(status, ignoreCase = true) }
                    .filter { a -> condition.isBlank() || a.condition.equals(condition, ignoreCase = true) }
                sortList(filtered, field, dir)
            }.collect { sorted ->
                _state.value = _state.value.copy(
                    assets = sorted,
                    total = if (_state.value.offline) sorted.size else _state.value.total,
                )
            }
        }
        refresh()
        viewModelScope.launch {
            scanner.scanResults.collect { result -> onScanResult(result) }
        }
    }

    // ─── Scanner ──────────────────────────────────────────────────────────

    fun triggerScan(type: ScanType = ScanType.RFID_UHF) {
        _state.value = _state.value.copy(isScanning = true, scanError = null)
        scanner.startScan(type)
        scanTimeoutJob?.cancel()
        scanTimeoutJob = viewModelScope.launch {
            delay(SCAN_TIMEOUT_MS)
            if (_state.value.isScanning) {
                scanner.stopScan()
                _state.value = _state.value.copy(
                    isScanning = false,
                    scanError = "No scan detected. Try again or type the asset name.",
                )
            }
        }
    }

    fun triggerBarcodeScan() = triggerScan(ScanType.BARCODE)

    fun openCameraFallback() {
        _state.value = _state.value.copy(showCamera = true)
    }

    fun closeCameraFallback() {
        _state.value = _state.value.copy(showCamera = false)
    }

    fun onCameraBarcodeScanned(value: String) {
        _state.value = _state.value.copy(showCamera = false)
        scanner.injectResult(ScanResult(value, ScanType.BARCODE))
    }

    private fun onScanResult(result: ScanResult) {
        scanTimeoutJob?.cancel()
        scanner.stopScan()
        _state.value = _state.value.copy(isScanning = false, scanError = null)
        viewModelScope.launch {
            when (val lookup = repo.lookupByTag(result.value)) {
                is TagLookup.Found -> {
                    val assetNumber = lookup.asset.assetNumber
                    onSearchChange(assetNumber)
                }
                is TagLookup.NotFound -> {
                    _state.value = _state.value.copy(
                        scanError = "No asset found for tag ${result.value}",
                    )
                }
            }
        }
    }

    fun onSearchChange(query: String) {
        _state.value = _state.value.copy(search = query)
        searchQuery.value = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            refresh()
        }
    }

    fun onStatusChange(status: String) {
        val value = if (_state.value.status == status) "" else status
        _state.value = _state.value.copy(status = value)
        statusFilter.value = value
        refresh()
    }

    fun onConditionChange(condition: String) {
        val value = if (_state.value.condition == condition) "" else condition
        _state.value = _state.value.copy(condition = value)
        conditionFilter.value = value
        refresh()
    }

    fun onSortChange(field: SortField) {
        val current = _state.value
        val dir = if (current.sortField == field) {
            if (current.sortDir == SortDir.ASC) SortDir.DESC else SortDir.ASC
        } else SortDir.ASC
        _state.value = current.copy(sortField = field, sortDir = dir)
        sortFieldFlow.value = field
        sortDirFlow.value = dir
        refresh()
    }

    fun refresh() {
        val s = _state.value
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            val total = repo.refresh(
                query = s.search.takeIf { it.isNotBlank() },
                status = s.status.takeIf { it.isNotBlank() },
                condition = s.condition.takeIf { it.isNotBlank() },
                sortBy = s.sortField.apiKey,
                sortOrder = s.sortDir.apiKey,
            )
            _state.value = if (total != null) {
                _state.value.copy(isLoading = false, total = total, offline = false)
            } else {
                _state.value.copy(
                    isLoading = false,
                    offline = true,
                    total = _state.value.assets.size,
                    error = if (_state.value.assets.isEmpty()) "Offline and no cached assets yet." else null,
                )
            }
        }
    }

    private companion object { const val SCAN_TIMEOUT_MS = 8_000L }

    private fun sortList(list: List<AssetResponse>, field: SortField, dir: SortDir): List<AssetResponse> {
        val comparator: Comparator<AssetResponse> = when (field) {
            SortField.NAME -> compareBy { it.name.lowercase() }
            SortField.ASSET_NUMBER -> compareBy { it.assetNumber.lowercase() }
            SortField.STATUS -> compareBy { it.status.lowercase() }
            SortField.CONDITION -> compareBy { it.condition.lowercase() }
            SortField.CREATED -> compareBy { it.assetNumber }
        }
        return if (dir == SortDir.DESC) list.sortedWith(comparator.reversed()) else list.sortedWith(comparator)
    }
}
