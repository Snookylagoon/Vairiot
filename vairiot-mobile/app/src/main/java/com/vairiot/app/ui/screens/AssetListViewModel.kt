package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.AssetRepository
import com.vairiot.app.data.api.AssetResponse
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
)

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class AssetListViewModel @Inject constructor(
    private val repo: AssetRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AssetListUiState())
    val state: StateFlow<AssetListUiState> = _state

    private val searchQuery = MutableStateFlow("")
    private val statusFilter = MutableStateFlow("")
    private val conditionFilter = MutableStateFlow("")
    private var searchJob: Job? = null

    private val localAssets: StateFlow<List<AssetResponse>> = searchQuery
        .flatMapLatest { repo.observeAssets(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            combine(localAssets, statusFilter, conditionFilter) { assets, status, condition ->
                Triple(assets, status, condition)
            }.collect { (assets, status, condition) ->
                val filtered = assets
                    .filter { a -> status.isBlank() || a.status.equals(status, ignoreCase = true) }
                    .filter { a -> condition.isBlank() || a.condition.equals(condition, ignoreCase = true) }
                val sorted = sortList(filtered)
                _state.value = _state.value.copy(
                    assets = sorted,
                    total = if (_state.value.offline) sorted.size else _state.value.total,
                )
            }
        }
        refresh()
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

    private fun sortList(list: List<AssetResponse>): List<AssetResponse> {
        val s = _state.value
        val comparator: Comparator<AssetResponse> = when (s.sortField) {
            SortField.NAME -> compareBy { it.name.lowercase() }
            SortField.ASSET_NUMBER -> compareBy { it.assetNumber.lowercase() }
            SortField.STATUS -> compareBy { it.status.lowercase() }
            SortField.CONDITION -> compareBy { it.condition.lowercase() }
            SortField.CREATED -> compareBy { it.assetNumber } // fallback, created isn't in cached model
        }
        return if (s.sortDir == SortDir.DESC) list.sortedWith(comparator.reversed()) else list.sortedWith(comparator)
    }
}
