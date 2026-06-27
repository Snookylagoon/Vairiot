package com.vairiot.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.vairiot.app.BuildConfig
import com.vairiot.app.data.api.PhotoResponse
import com.vairiot.app.ui.components.ClearableTextField
import com.vairiot.app.ui.theme.*
import dagger.hilt.android.EntryPointAccessors
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceDetailScreen(
    onBack: () -> Unit,
    viewModel: MaintenanceDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val imageLoader = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            ImageLoaderEntryPoint::class.java,
        ).imageLoader()
    }
    val canWrite = state.permissions.contains("asset:write")
    val event = state.event

    var captureUri by remember { mutableStateOf<Uri?>(null) }
    var localError by remember { mutableStateOf<String?>(null) }
    var viewingPhoto by remember { mutableStateOf<PhotoResponse?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = captureUri
        if (success && uri != null) viewModel.uploadFromUri(uri)
        captureUri = null
    }

    fun launchCamera() {
        localError = null
        try {
            val dir = File(context.cacheDir, "maintenance").apply { mkdirs() }
            val file = File(dir, "maint-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            captureUri = uri
            takePicture.launch(uri)
        } catch (_: Exception) {
            localError = "No camera app available."
        }
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) launchCamera() else localError = "Camera permission denied."
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(event?.workOrderNumber ?: "Maintenance Detail") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.isLoading -> Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = VairiotViolet)
            }

            state.error != null -> Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error!!, color = ErrorRed)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { viewModel.load() }) { Text("Retry") }
                }
            }

            event != null -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Completion success
                if (state.completed) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = SuccessGreen.copy(alpha = 0.1f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = SuccessGreen)
                            Spacer(Modifier.width(8.dp))
                            Text("Task completed",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold, color = SuccessGreen)
                        }
                    }
                }

                // Details card
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Details", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                            MaintenanceStatusBadge(event.status)
                        }

                        HorizontalDivider()

                        DetailInfoRow("Asset",
                            event.asset?.let { "${it.assetNumber} — ${it.name}" } ?: event.assetId)
                        DetailInfoRow("Type",
                            event.maintenanceType.replaceFirstChar { it.uppercase() })
                        event.workOrderNumber?.let { DetailInfoRow("Work Order", it) }
                        event.vendor?.let { DetailInfoRow("Vendor", it) }
                        event.cost?.let { DetailInfoRow("Cost", "$$it") }
                        event.scheduledDate?.let { DetailInfoRow("Scheduled", formatDate(it)) }
                        event.completedDate?.let { DetailInfoRow("Completed", formatDate(it)) }
                        DetailInfoRow("Created", formatDate(event.createdAt))
                    }
                }

                // Description & notes
                if (!event.description.isNullOrBlank() || !event.notes.isNullOrBlank()) {
                    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Notes", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                            HorizontalDivider()
                            event.description?.let {
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                            event.notes?.let {
                                if (it != event.description) {
                                    Text(it, style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
                                }
                            }
                        }
                    }
                }

                // Photos
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Photos (${state.photos.size})",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)

                        if (canWrite && state.photos.size < 4 && event.status != "completed") {
                            OutlinedButton(
                                onClick = {
                                    val hasPerm = ContextCompat.checkSelfPermission(
                                        context, Manifest.permission.CAMERA,
                                    ) == PackageManager.PERMISSION_GRANTED
                                    if (hasPerm) launchCamera()
                                    else requestCameraPermission.launch(Manifest.permission.CAMERA)
                                },
                                enabled = !state.isUploading,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                if (state.isUploading) {
                                    CircularProgressIndicator(color = VairiotViolet,
                                        strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                } else {
                                    Icon(Icons.Default.AddAPhoto, contentDescription = null,
                                        modifier = Modifier.size(16.dp))
                                }
                                Spacer(Modifier.width(6.dp))
                                Text(if (state.isUploading) "Uploading…" else "Take Photo")
                            }
                        }

                        localError?.let {
                            Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                        }
                        state.uploadError?.let {
                            Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                        }

                        if (state.photos.isEmpty()) {
                            Text("No photos yet.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        } else {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(state.photos, key = { it.id }) { photo ->
                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Box(modifier = Modifier.size(100.dp)
                                            .clickable { viewingPhoto = photo }) {
                                            AsyncImage(
                                                model = ImageRequest.Builder(context)
                                                    .data("${BuildConfig.API_BASE_URL}api/v1/photos/${photo.id}/download")
                                                    .crossfade(true)
                                                    .build(),
                                                imageLoader = imageLoader,
                                                contentDescription = photo.caption ?: "Photo",
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                                    .clip(RoundedCornerShape(8.dp)),
                                            )
                                            if (canWrite && event.status != "completed") {
                                                IconButton(
                                                    onClick = { viewModel.deletePhoto(photo.id) },
                                                    modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                                                ) {
                                                    Surface(shape = RoundedCornerShape(50),
                                                        color = White.copy(alpha = 0.85f)) {
                                                        Icon(Icons.Default.Close,
                                                            contentDescription = "Delete",
                                                            tint = ErrorRed,
                                                            modifier = Modifier.padding(2.dp).size(16.dp))
                                                    }
                                                }
                                            }
                                        }
                                        if (!photo.caption.isNullOrBlank()) {
                                            Text(photo.caption,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                                                maxLines = 1,
                                                modifier = Modifier.width(100.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Action buttons
                if (canWrite && event.status != "completed" && event.status != "cancelled") {
                    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Actions", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                            HorizontalDivider()

                            if (event.status == "scheduled") {
                                Button(
                                    onClick = { viewModel.startTask() },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = WarningAmber),
                                ) {
                                    Icon(Icons.Default.PlayArrow, contentDescription = null,
                                        modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text("Start Work")
                                }
                            }

                            ClearableTextField(
                                value = state.completionNotes,
                                onValueChange = { viewModel.setCompletionNotes(it) },
                                label = { Text("Completion notes") },
                                placeholder = { Text("Describe the work done…") },
                                singleLine = false, minLines = 3, maxLines = 6,
                            )

                            state.completeError?.let {
                                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                            }

                            Button(
                                onClick = { viewModel.completeTask() },
                                enabled = !state.isCompleting,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                            ) {
                                if (state.isCompleting) {
                                    CircularProgressIndicator(color = White, strokeWidth = 2.dp,
                                        modifier = Modifier.size(16.dp))
                                } else {
                                    Icon(Icons.Default.Check, contentDescription = null,
                                        modifier = Modifier.size(18.dp))
                                }
                                Spacer(Modifier.width(8.dp))
                                Text("Complete Task")
                            }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
            }
        }
    }

    // Photo viewer dialog
    viewingPhoto?.let { photo ->
        MaintenancePhotoViewerDialog(
            photo = photo,
            imageLoader = imageLoader,
            canEdit = canWrite,
            onDismiss = { viewingPhoto = null },
            onSaveCaption = { caption ->
                viewModel.updateCaption(photo.id, caption)
                viewingPhoto = photo.copy(caption = caption.ifBlank { null })
            },
            onDelete = {
                viewModel.deletePhoto(photo.id)
                viewingPhoto = null
            },
        )
    }
}

@Composable
private fun DetailInfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Text(value, style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium, color = VairiotCharcoal)
    }
}

@Composable
private fun MaintenancePhotoViewerDialog(
    photo: PhotoResponse,
    imageLoader: ImageLoader,
    canEdit: Boolean,
    onDismiss: () -> Unit,
    onSaveCaption: (String) -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    var caption by remember(photo.id) { mutableStateOf(photo.caption.orEmpty()) }
    val dirty = caption.trim() != (photo.caption ?: "").trim()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.95f).fillMaxHeight(0.85f),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data("${BuildConfig.API_BASE_URL}api/v1/photos/${photo.id}/download")
                        .crossfade(true)
                        .build(),
                    imageLoader = imageLoader,
                    contentDescription = photo.caption ?: "Photo",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(8.dp)),
                )
                if (canEdit) {
                    ClearableTextField(
                        value = caption,
                        onValueChange = { caption = it.take(500) },
                        label = { Text("Caption") },
                        singleLine = false, maxLines = 3,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()) {
                    if (canEdit) {
                        OutlinedButton(onClick = onDelete) {
                            Icon(Icons.Default.Delete, contentDescription = null,
                                modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Delete")
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Close") }
                    if (canEdit) {
                        Button(
                            onClick = { onSaveCaption(caption.trim()) },
                            enabled = dirty,
                            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null,
                                modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Save")
                        }
                    }
                }
            }
        }
    }
}
