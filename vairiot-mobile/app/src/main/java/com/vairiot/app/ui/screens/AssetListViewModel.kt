package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AssetListUiState(
    val isLoading: Boolean = false,
    val assets:    List<AssetResponse> = emptyList(),
    val search:    String = "",
    val total:     Int = 0,
    val error:     String? = null,
)

@HiltViewModel
class AssetListViewModel @Inject constructor(
    private val api: VairiotApiService,
) : ViewModel() {

    private val _state = MutableStateFlow(AssetListUiState())
    val state: StateFlow<AssetListUiState> = _state

    private var searchJob: Job? = null

    init { load() }

    fun onSearchChange(query: String) {
        _state.value = _state.value.copy(search = query)
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            load()
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val q = _state.value.search.takeIf { it.isNotBlank() }
                val resp = api.listAssets(search = q, page = 1, pageSize = 50)
                _state.value = _state.value.copy(
                    isLoading = false, assets = resp.assets, total = resp.total,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = "Could not load assets: ${e.message}",
                )
            }
        }
    }
}
