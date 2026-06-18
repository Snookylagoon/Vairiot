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
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AssetListUiState(
    val isLoading: Boolean = false,
    val assets:    List<AssetResponse> = emptyList(),
    val search:    String = "",
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
    private var searchJob: Job? = null

    private val localAssets: StateFlow<List<AssetResponse>> = searchQuery
        .flatMapLatest { repo.observeAssets(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            localAssets.collect { assets ->
                _state.value = _state.value.copy(
                    assets = assets,
                    total = if (_state.value.offline) assets.size else _state.value.total,
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
            refresh(query)
        }
    }

    fun refresh(query: String = _state.value.search) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            val total = repo.refresh(query)
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
}
