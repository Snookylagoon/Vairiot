package com.vairiot.app.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.vairiot.app.ui.theme.*
import java.io.File

private val MAINTENANCE_TYPES = listOf(
    "repair"     to "Repair",
    "inspection" to "Inspection",
    "service"    to "Service",
    "other"      to "Other",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceRequestSection(
    viewModel: MaintenanceRequestViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    var captureUri by remember { mutableStateOf<Uri?>(null) }
    var permissionError by remember { mutableStateOf<String?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = captureUri
        if (success && uri != null) viewModel.setPhoto(uri)
        captureUri = null
    }

    val pickFromGallery = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) viewModel.setPhoto(uri) }

    fun launchCamera() {
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (intent.resolveActivity(context.packageManager) == null) {
            permissionError = "No camera app available."
            return
        }
        permissionError = null
        val uri = newMaintenanceCaptureUri(context)
        captureUri = uri
        takePicture.launch(uri)
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) launchCamera() else permissionError = "Camera permission denied."
    }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Build, contentDescription = null, tint = VairiotViolet,
                    modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Report maintenance",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
            }

            state.lastWorkOrder?.let { wo ->
                Surface(shape = RoundedCornerShape(8.dp), color = VairiotWash) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = VairiotViolet)
                        Spacer(Modifier.width(8.dp))
                        Text("Sent to Maintenance — $wo",
                            style = MaterialTheme.typography.bodyMedium,
                            color = VairiotCharcoal, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { viewModel.clearLastWorkOrder() }) { Text("New") }
                    }
                }
                return@Column
            }

            FlowRowTypes(
                selected = state.maintenanceType,
                onSelect = viewModel::setType,
            )

            OutlinedTextField(
                value = state.notes,
                onValueChange = viewModel::setNotes,
                label = { Text("What needs doing?") },
                placeholder = { Text("Describe the fault, symptoms or work required…") },
                minLines = 3,
                maxLines = 6,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        val hasPerm = ContextCompat.checkSelfPermission(
                            context, Manifest.permission.CAMERA,
                        ) == PackageManager.PERMISSION_GRANTED
                        if (hasPerm) launchCamera()
                        else requestCameraPermission.launch(Manifest.permission.CAMERA)
                    },
                    enabled = !state.isSubmitting,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.AddAPhoto, contentDescription = null,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Camera")
                }
                OutlinedButton(
                    onClick = {
                        permissionError = null
                        pickFromGallery.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    enabled = !state.isSubmitting,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = null,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Gallery")
                }
            }

            state.photoUri?.let { uri ->
                Box(modifier = Modifier.size(120.dp)) {
                    AsyncImage(
                        model = uri,
                        contentDescription = "Maintenance photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)),
                    )
                    IconButton(
                        onClick = { viewModel.setPhoto(null) },
                        modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                    ) {
                        Surface(shape = RoundedCornerShape(50),
                            color = White.copy(alpha = 0.85f)) {
                            Icon(Icons.Default.Close, contentDescription = "Remove",
                                tint = ErrorRed,
                                modifier = Modifier.padding(2.dp).size(16.dp))
                        }
                    }
                }
            }

            permissionError?.let {
                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            }
            state.error?.let {
                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = { viewModel.submit() },
                enabled = !state.isSubmitting && state.notes.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(
                        color = White, strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                    )
                } else {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null,
                        modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text("Send to Maintenance")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FlowRowTypes(selected: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth()) {
        MAINTENANCE_TYPES.forEach { (value, label) ->
            FilterChip(
                selected = selected == value,
                onClick  = { onSelect(value) },
                label    = { Text(label) },
            )
        }
    }
}

private fun newMaintenanceCaptureUri(context: android.content.Context): Uri {
    val dir = File(context.cacheDir, "maintenance").apply { mkdirs() }
    val file = File(dir, "maint-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
}
