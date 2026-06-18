package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuditListUiState(
    val isLoading: Boolean = false,
    val campaigns: List<AuditCampaignResponse> = emptyList(),
    val error:     String? = null,
)

@HiltViewModel
class AuditListViewModel @Inject constructor(
    private val api: VairiotApiService,
) : ViewModel() {

    private val _state = MutableStateFlow(AuditListUiState())
    val state: StateFlow<AuditListUiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                _state.value = AuditListUiState(isLoading = false, campaigns = api.listAudits())
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false, error = "Could not load audits: ${e.message}"
                )
            }
        }
    }
}
