package com.vairiot.app.ui.components

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.vairiot.app.location.hasLocationPermission
import kotlinx.coroutines.flow.StateFlow

/**
 * Asks for location permission once per screen visit while [enabled] is true
 * (GIS on), so audit scans can carry the device position. Declining is fine:
 * scans are recorded without a position.
 */
@Composable
fun LocationPermissionPrompt(enabled: StateFlow<Boolean>) {
    val on by enabled.collectAsState()
    val context = LocalContext.current
    var asked by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    LaunchedEffect(on) {
        if (on && !asked && !hasLocationPermission(context)) {
            asked = true
            launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }
}
