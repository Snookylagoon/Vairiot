package com.vairiot.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.update.MobileVersionResponse
import com.vairiot.app.update.UpdateCheckResult
import com.vairiot.app.update.UpdateChecker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** State for the blocking "Update required" gate. */
sealed interface GateState {
    /** Not yet checked, or check in flight — the app is shown normally. */
    object Open : GateState
    /** A mandatory update exists; block the app behind the gate. */
    data class Required(val info: MobileVersionResponse) : GateState
    /** Downloading / handing off to the system installer. */
    data class Installing(val info: MobileVersionResponse) : GateState
    /** Install did not complete (cancelled, or signing conflict). Offer retry. */
    data class Failed(val info: MobileVersionResponse) : GateState
}

@HiltViewModel
class UpdateGateViewModel @Inject constructor(
    private val updateChecker: UpdateChecker,
) : ViewModel() {

    private val _state = MutableStateFlow<GateState>(GateState.Open)
    val state: StateFlow<GateState> = _state

    /** Check once on entry. Only a confirmed mandatory update blocks; everything
     *  else (up to date, optional update, offline, error) leaves the app open so
     *  field devices are never locked out by a transient network failure. */
    fun check() {
        if (_state.value !is GateState.Open) return
        viewModelScope.launch {
            val result = updateChecker.checkForUpdate()
            if (result is UpdateCheckResult.Available && result.info.mandatory) {
                _state.value = GateState.Required(result.info)
            }
        }
    }

    fun install() {
        val info = when (val s = _state.value) {
            is GateState.Required -> s.info
            is GateState.Failed   -> s.info
            else                  -> return
        }
        viewModelScope.launch {
            _state.value = GateState.Installing(info)
            val ok = updateChecker.downloadAndInstall(info)
            // On success the system installer replaces this app; if it returns
            // (user cancelled the prompt, or a signing conflict could not be
            // resolved) surface a retry instead of silently looping.
            if (!ok) _state.value = GateState.Failed(info)
        }
    }
}

/**
 * Wraps the whole app. When the server advertises a *mandatory* update that is
 * newer than this build, an opaque non-dismissible screen covers everything and
 * the only way forward is to install. The version check is public (no auth) so
 * this works even before sign-in.
 */
@Composable
fun MandatoryUpdateGate(
    viewModel: UpdateGateViewModel = hiltViewModel(),
    content: @Composable () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.check() }

    Box(Modifier.fillMaxSize()) {
        content()
        if (state !is GateState.Open) {
            UpdateRequiredOverlay(state = state, onInstall = viewModel::install)
        }
    }
}

@Composable
private fun UpdateRequiredOverlay(state: GateState, onInstall: () -> Unit) {
    // Swallow the back button so the gate cannot be dismissed.
    BackHandler(enabled = true) {}

    val installing = state is GateState.Installing
    val failed     = state is GateState.Failed
    val info = when (state) {
        is GateState.Required   -> state.info
        is GateState.Installing -> state.info
        is GateState.Failed     -> state.info
        else                    -> null
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                "Update required",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "A required update (version ${info?.versionName ?: ""}) must be installed " +
                    "before you can continue using Vairiot.",
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            info?.releaseNotes?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center)
            }

            Spacer(Modifier.height(28.dp))

            if (installing) {
                CircularProgressIndicator()
                Spacer(Modifier.height(12.dp))
                Text("Downloading update…", fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                if (failed) {
                    Text(
                        "The update could not be installed. Make sure you accept the " +
                            "system install prompt, then try again.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                }
                Button(onClick = onInstall, modifier = Modifier.fillMaxWidth()) {
                    Text(if (failed) "Try again" else "Install now")
                }
            }
        }
    }
}
