package com.vairiot.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = captureUri
        if (success && uri != null) viewModel.uploadFromUri(uri)
        captureUri = null
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            val uri = newCaptureUri(context)
            captureUri = uri
            takePicture.launch(uri)
        }
    }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text("Photos (${state.photos.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                Button(
                    onClick = {
                        val hasPerm = ContextCompat.checkSelfPermission(
                            context, Manifest.permission.CAMERA,
                        ) == PackageManager.PERMISSION_GRANTED
                        if (hasPerm) {
                            val uri = newCaptureUri(context)
                            captureUri = uri
                            takePicture.launch(uri)
                        } else {
                            requestCameraPermission.launch(Manifest.permission.CAMERA)
                        }
                    },
                    enabled = !state.isUploading,
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                ) {
                    Icon(Icons.Default.AddAPhoto, contentDescription = null,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Add")
                }
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
                        Box(modifier = Modifier.size(100.dp)) {
                            AsyncImage(
                                model = ImageRequest.Builder(context)
                                    .data("${BuildConfig.API_BASE_URL}api/v1/photos/${photo.id}/download")
                                    .crossfade(true)
                                    .build(),
                                imageLoader = imageLoader,
                                contentDescription = null,
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
