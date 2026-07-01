package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.ScanSessionRepository
import com.vairiot.app.data.api.CategoryRefResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.domain.model.SessionScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ScanSessionSetupState(
    val sites:            List<SiteRefResponse> = emptyList(),
    val categories:       List<CategoryRefResponse> = emptyList(),
    val selectedSiteId:   String? = null,
    val selectedCatId:    String? = null,
    val isLoading:        Boolean = true,
    val isStarting:       Boolean = false,
    val error:            String? = null,
)

@HiltViewModel
class ScanSessionSetupViewModel @Inject constructor(
    private val api:  VairiotApiService,
    private val repo: ScanSessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ScanSessionSetupState())
    val state: StateFlow<ScanSessionSetupState> = _state

    init { loadPickers() }

    private fun loadPickers() {
        viewModelScope.launch {
            try {
                val sites = api.listSites()
                val categories = api.listCategories()
                _state.value = _state.value.copy(
                    sites      = sites,
                    categories = categories,
                    isLoading  = false,
                )
            } catch (e: Exception) {
                // Setup still works with no filter — sites/categories are optional.
                _state.value = _state.value.copy(isLoading = false, error = null)
            }
        }
    }

    fun selectSite(siteId: String?) {
        _state.value = _state.value.copy(selectedSiteId = siteId)
    }

    fun selectCategory(categoryId: String?) {
        _state.value = _state.value.copy(selectedCatId = categoryId)
    }

    fun start(onStarted: (sessionId: String) -> Unit) {
        val s = _state.value
        if (s.isStarting) return
        _state.value = s.copy(isStarting = true, error = null)
        viewModelScope.launch {
            try {
                val site = s.selectedSiteId?.let { id -> s.sites.firstOrNull { it.id == id } }
                val cat  = s.selectedCatId?.let  { id -> s.categories.firstOrNull { it.id == id } }
                val id = repo.startSession(
                    SessionScope(
                        siteId       = site?.id,
                        siteName     = site?.name,
                        categoryId   = cat?.id,
                        categoryName = cat?.name,
                    ),
                )
                onStarted(id)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isStarting = false,
                    error      = "Couldn't start session: ${e.message}",
                )
            }
        }
    }
}
