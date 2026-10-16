package com.vairiot.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.vairiot.app.ui.theme.ErrorRed
import com.vairiot.app.ui.theme.VairiotCharcoal
import com.vairiot.app.ui.theme.VairiotWash

/**
 * The audit run's message area: the last result, any error, and (stage 1.8)
 * a button that photographs evidence for the last scan. Moved out of
 * AuditRunScreen, which is on the line-limit baseline.
 */
@Composable
fun AuditMessages(lastMessage: String?, error: String?, lastScan: LastScan?, onPhoto: (Uri) -> Unit) {
    val context = LocalContext.current
    var captureUri by remember { mutableStateOf<Uri?>(null) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        captureUri?.takeIf { ok }?.let(onPhoto)
        captureUri = null
    }
    fun launchCamera() {
        cameraError = null
        try {
            newCaptureUri(context).also { captureUri = it; takePicture.launch(it) }
        } catch (_: Exception) {
            cameraError = "No camera app available."
        }
    }
    val requestCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera() else cameraError = "Camera permission denied."
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        lastMessage?.let { Note(it, VairiotWash, VairiotCharcoal) }
        (error ?: cameraError)?.let { Note(it, ErrorRed.copy(alpha = 0.12f), ErrorRed) }
        if (lastScan != null) {
            OutlinedButton(
                onClick = {
                    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                        PackageManager.PERMISSION_GRANTED
                    if (granted) launchCamera() else requestCamera.launch(Manifest.permission.CAMERA)
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Add photo to ${lastScan.tagValue}")
            }
        }
    }
}

@Composable
private fun Note(text: String, background: androidx.compose.ui.graphics.Color, colour: androidx.compose.ui.graphics.Color) {
    Surface(color = background, shape = RoundedCornerShape(8.dp)) {
        Text(text, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodySmall, color = colour)
    }
}
