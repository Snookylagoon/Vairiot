package com.vairiot.app.ui.components

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.vairiot.app.location.GpsCaptureState
import com.vairiot.app.location.hasLocationPermission
import com.vairiot.app.ui.theme.ErrorRed
import com.vairiot.app.ui.theme.VairiotViolet

/**
 * GPS position for an asset form: shows the position, captures a fresh fix
 * (asking for location permission first if needed) and removes it.
 */
@Composable
fun GpsPositionSection(
    state: GpsCaptureState,
    onCapture: () -> Unit,
    onRemove: () -> Unit,
    onPermissionDenied: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants -> if (grants.values.any { it }) onCapture() else onPermissionDenied() }

    fun capture() {
        if (hasLocationPermission(context)) {
            onCapture()
        } else {
            permissionLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ))
        }
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("GPS position", style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))

        state.position?.let { position ->
            Text(position.coordinateText, style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace)
            position.detailText?.let {
                Text(it, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = ::capture, enabled = !state.isCapturing) {
                if (state.isCapturing) {
                    CircularProgressIndicator(color = VairiotViolet,
                        modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(6.dp))
                    Text("Getting fix…")
                } else {
                    Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (state.position == null) "Capture GPS" else "Recapture")
                }
            }
            if (state.position != null && !state.isCapturing) {
                TextButton(onClick = onRemove) {
                    Icon(Icons.Default.LocationOff, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Remove")
                }
            }
        }

        state.error?.let { error ->
            Text(error, style = MaterialTheme.typography.bodySmall, color = ErrorRed)
            if (state.accessDenied) {
                TextButton(onClick = {
                    context.startActivity(Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", context.packageName, null),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }) { Text("Open settings") }
            }
        }
    }
}
