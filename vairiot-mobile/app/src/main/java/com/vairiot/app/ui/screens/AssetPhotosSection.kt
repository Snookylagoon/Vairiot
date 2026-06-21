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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Save
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.text.input.ImeAction
import com.vairiot.app.data.api.PhotoResponse
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
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
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.vairiot.app.BuildConfig
import com.vairiot.app.ui.theme.*
import dagger.hilt.android.EntryPointAccessors
import java.io.File

@Composable
fun AssetPhotosSection(
    viewModel: AssetPhotosViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val imageLoader = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            ImageLoaderEntryPoint::class.java,
        ).imageLoader()
    }

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
            val uri = newCaptureUri(context)
            captureUri = uri
            takePicture.launch(uri)
        } catch (_: Exception) {
            localError = "No camera app available."
        }
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) launchCamera()
        else localError = "Camera permission denied."
    }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Photos (${state.photos.size})",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)

            if (state.photos.size < 2) {
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
                    Icon(Icons.Default.AddAPhoto, contentDescription = null,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Take Photo")
                }
            }

            localError?.let {
                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            }
            state.error?.let {
                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            }

            when {
                state.isLoading -> CircularProgressIndicator(color = VairiotViolet,
                    modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                state.photos.isEmpty() -> Text("No photos yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                else -> LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.photos, key = { it.id }) { photo ->
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Box(modifier = Modifier.size(100.dp).clickable { viewingPhoto = photo }) {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data("${BuildConfig.API_BASE_URL}api/v1/photos/${photo.id}/download")
                                        .crossfade(true)
                                        .build(),
                                    imageLoader = imageLoader,
                                    contentDescription = photo.caption ?: "Asset photo",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                        .clip(RoundedCornerShape(8.dp)),
                                )
                                IconButton(
                                    onClick = { viewModel.delete(photo.id) },
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
                            if (!photo.caption.isNullOrBlank()) {
                                Text(
                                    text = photo.caption,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                                    maxLines = 1,
                                    modifier = Modifier.width(100.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    viewingPhoto?.let { photo ->
        PhotoViewerDialog(
            photo = photo,
            imageLoader = imageLoader,
            onDismiss = { viewingPhoto = null },
            onSaveCaption = { caption ->
                viewModel.updateCaption(photo.id, caption)
                viewingPhoto = photo.copy(caption = caption.ifBlank { null })
            },
            onDelete = {
                viewModel.delete(photo.id)
                viewingPhoto = null
            },
        )
    }
}

@Composable
private fun PhotoViewerDialog(
    photo: PhotoResponse,
    imageLoader: ImageLoader,
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
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data("${BuildConfig.API_BASE_URL}api/v1/photos/${photo.id}/download")
                        .crossfade(true)
                        .build(),
                    imageLoader = imageLoader,
                    contentDescription = photo.caption ?: "Asset photo",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(8.dp)),
                )
                OutlinedTextField(
                    value = caption,
                    onValueChange = { caption = it.take(500) },
                    label = { Text("Caption") },
                    placeholder = { Text("Describe this photo…") },
                    singleLine = false,
                    maxLines = 3,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Delete")
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Close") }
                    Button(
                        onClick = { onSaveCaption(caption.trim()) },
                        enabled = dirty,
                        colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                    ) {
                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Save")
                    }
                }
            }
        }
    }
}

private fun newCaptureUri(context: android.content.Context): Uri {
    val dir = File(context.cacheDir, "photos").apply { mkdirs() }
    val file = File(dir, "capture-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
}

/* Hilt entry point so non-injectable Composables can resolve ImageLoader. */
@dagger.hilt.EntryPoint
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
interface ImageLoaderEntryPoint {
    fun imageLoader(): ImageLoader
}
