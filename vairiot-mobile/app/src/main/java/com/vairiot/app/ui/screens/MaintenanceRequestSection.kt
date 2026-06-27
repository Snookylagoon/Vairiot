package com.vairiot.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.vairiot.app.ui.components.ClearableTextField
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
    var viewingPhotoUri by remember { mutableStateOf<Uri?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = captureUri
        if (success && uri != null) viewModel.setPhoto(uri)
        captureUri = null
    }

    fun launchCamera() {
        permissionError = null
        try {
            val uri = newMaintenanceCaptureUri(context)
            captureUri = uri
            takePicture.launch(uri)
        } catch (_: Exception) {
            permissionError = "No camera app available."
        }
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

            ClearableTextField(
                value = state.notes,
                onValueChange = viewModel::setNotes,
                label = { Text("What needs doing?") },
                placeholder = { Text("Describe the fault, symptoms or work required…") },
                singleLine = false,
                minLines = 3,
                maxLines = 6,
            )

            ScheduledDatePickerRow(
                epochMs = state.scheduledDate,
                onChange = viewModel::setScheduledDate,
            )

            OutlinedButton(
                onClick = {
                    val hasPerm = ContextCompat.checkSelfPermission(
                        context, Manifest.permission.CAMERA,
                    ) == PackageManager.PERMISSION_GRANTED
                    if (hasPerm) launchCamera()
                    else requestCameraPermission.launch(Manifest.permission.CAMERA)
                },
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.AddAPhoto, contentDescription = null,
                    modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Take Photo")
            }

            state.photoUri?.let { uri ->
                Box(modifier = Modifier.size(120.dp).clickable { viewingPhotoUri = uri }) {
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

    viewingPhotoUri?.let { uri ->
        Dialog(
            onDismissRequest = { viewingPhotoUri = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(0.95f).fillMaxHeight(0.85f),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    AsyncImage(
                        model = uri,
                        contentDescription = "Maintenance photo",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(8.dp)),
                    )
                    IconButton(
                        onClick = { viewingPhotoUri = null },
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                    ) {
                        Surface(shape = RoundedCornerShape(50),
                            color = White.copy(alpha = 0.85f)) {
                            Icon(Icons.Default.Close,
                                contentDescription = "Close",
                                tint = VairiotCharcoal,
                                modifier = Modifier.padding(4.dp).size(20.dp))
                        }
                    }
                }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduledDatePickerRow(epochMs: Long?, onChange: (Long?) -> Unit) {
    var showPicker by remember { mutableStateOf(false) }
    val label = epochMs?.let {
        val fmt = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        fmt.format(java.util.Date(it))
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(
            onClick = { showPicker = true },
            modifier = Modifier.weight(1f),
        ) {
            Icon(Icons.Default.CalendarMonth, contentDescription = null,
                modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(label ?: "Scheduled date (optional)")
        }
        if (epochMs != null) {
            IconButton(onClick = { onChange(null) }) {
                Icon(Icons.Default.Close, contentDescription = "Clear date",
                    tint = ErrorRed, modifier = Modifier.size(18.dp))
            }
        }
    }

    if (showPicker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = epochMs)
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    onChange(pickerState.selectedDateMillis)
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text("Cancel") }
            },
        ) {
            DatePicker(state = pickerState)
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
