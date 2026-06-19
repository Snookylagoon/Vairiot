package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.UserProfileResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.TokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val isLoading:       Boolean = true,
    val email:           String? = null,
    val tenantId:        String? = null,
    val roles:           List<String> = emptyList(),
    val licenceNumber:   String? = null,
    val licenceTier:     String? = null,
    val licenceStatus:   String? = null,
    val licenceStart:    String? = null,
    val offline:         Boolean = false,
    val error:           String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val api:        VairiotApiService,
    private val tokenStore: TokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            // Show cached licence immediately, then try the network.
            val cached = tokenStore.getCachedLicence()
            _state.value = _state.value.copy(
                licenceNumber = cached.number,
                licenceTier   = cached.tier,
                licenceStatus = cached.status,
                licenceStart  = cached.startDate,
            )

            try {
                val me: UserProfileResponse = api.getMe()
                val licence = api.getLicenceStatus()
                tokenStore.saveLicence(licence.licenceNumber, licence.tierDisplayName, licence.status, licence.activatedAt)
                _state.value = ProfileUiState(
                    isLoading     = false,
                    email         = me.email,
                    tenantId      = me.tenantId,
                    roles         = me.roles,
                    licenceNumber = licence.licenceNumber,
                    licenceTier   = licence.tierDisplayName,
                    licenceStatus = licence.status,
                    licenceStart  = licence.activatedAt,
                    offline       = false,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    offline   = cached.number != null,
                    error     = if (cached.number == null) "Could not load profile: ${e.message}" else null,
                )
            }
        }
    }
}
