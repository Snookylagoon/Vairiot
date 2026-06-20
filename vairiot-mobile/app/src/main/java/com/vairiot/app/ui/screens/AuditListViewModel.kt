package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.data.api.CategoryRefResponse
import com.vairiot.app.data.api.CreateAuditRequest
import com.vairiot.app.data.api.LocationRefResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuditListUiState(
    val isLoading:  Boolean = false,
    val campaigns:  List<AuditCampaignResponse> = emptyList(),
    val error:      String? = null,

    // Create-sheet scope data
    val sites:      List<SiteRefResponse>     = emptyList(),
    val locations:  List<LocationRefResponse> = emptyList(),
    val categories: List<CategoryRefResponse> = emptyList(),
    val isCreating: Boolean = false,
    val createError: String? = null,
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
                _state.value = _state.value.copy(
                    isLoading = false,
                    campaigns = api.listAudits(),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false, error = "Could not load audits: ${e.message}"
                )
            }
        }
    }

    /** Lazy-load sites + categories the first time the create sheet opens. */
    fun ensureScopeRefs() {
        if (_state.value.sites.isNotEmpty() || _state.value.categories.isNotEmpty()) return
        viewModelScope.launch {
            try {
                val sites      = api.listSites()
                val categories = api.listCategories()
                _state.value = _state.value.copy(sites = sites, categories = categories)
            } catch (_: Exception) { /* leave lists empty — picker just shows "All" */ }
        }
    }

    fun loadLocationsForSite(siteId: String?) {
        if (siteId.isNullOrBlank()) {
            _state.value = _state.value.copy(locations = emptyList())
            return
        }
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(locations = api.listSiteLocations(siteId))
            } catch (_: Exception) {
                _state.value = _state.value.copy(locations = emptyList())
            }
        }
    }

    fun createCampaign(
        name: String,
        mode: String?,
        siteId: String?,
        locationId: String?,
        categoryId: String?,
        onCreated: () -> Unit,
    ) {
        if (name.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isCreating = true, createError = null)
            try {
                api.createAudit(CreateAuditRequest(
                    name       = name.trim(),
                    mode       = mode,
                    siteId     = siteId?.takeIf { it.isNotBlank() },
                    locationId = locationId?.takeIf { it.isNotBlank() },
                    categoryId = categoryId?.takeIf { it.isNotBlank() },
                ))
                _state.value = _state.value.copy(isCreating = false)
                load()
                onCreated()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isCreating = false,
                    createError = "Could not create: ${e.message}",
                )
            }
        }
    }
}
