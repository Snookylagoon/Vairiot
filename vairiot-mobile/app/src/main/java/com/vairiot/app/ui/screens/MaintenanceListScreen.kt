package com.vairiot.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.vairiot.app.LocalUseSideRail
import com.vairiot.app.data.api.MaintenanceEventResponse
import com.vairiot.app.scanner.CameraBarcodeScannerScreen
import com.vairiot.app.ui.components.ClearableTextField
import com.vairiot.app.ui.theme.*
import java.io.File

private val STATUS_FILTERS = listOf("scheduled", "in_progress", "completed", "cancelled")

private val MAINTENANCE_TYPES = listOf(
    "repair"     to "Repair",
    "inspection" to "Inspection",
    "service"    to "Service",
    "other"      to "Other",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceListScreen(
    onEventClick: (eventId: String) -> Unit,
    viewModel: MaintenanceListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var statusFilter by rememberSaveable { mutableStateOf("") }
    val canWrite = state.permissions.contains("asset:write")
    val sideRail = LocalUseSideRail.current

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

            if (!sideRail) {
                // Header — only in portrait (landscape has shared header)
                Box(
                    modifier = Modifier.fillMaxWidth()
                        .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                        .padding(16.dp),
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.height(32.dp).width(4.dp)
                                .background(Brush.verticalGradient(listOf(VairiotPink, VairiotViolet)),
                                    RoundedCornerShape(2.dp)))
                            Spacer(Modifier.width(12.dp))
                            Text("VAIRIOT", style = MaterialTheme.typography.titleLarge,
                                fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                                color = White)
                        }
                        Spacer(Modifier.height(4.dp))
                        Text("Maintenance — ${state.total} job${if (state.total == 1) "" else "s"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = White.copy(alpha = 0.6f))
                    }
                }
            }

            // Status filter chips
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MaintenanceStatusFilter(
                    selected = statusFilter,
                    onSelect = { filter ->
                        statusFilter = if (statusFilter == filter) "" else filter
                        viewModel.load(statusFilter.ifBlank { null })
                    },
                )

                when {
                    state.isLoading && state.events.isEmpty() -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(color = VairiotViolet,
                            modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                    }
                    state.error != null -> Text(state.error!!, color = ErrorRed,
                        style = MaterialTheme.typography.bodyMedium)
                    state.events.isEmpty() -> Text(
                        "No maintenance jobs found.",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
            }

            // Success banner
            state.lastWorkOrder?.let { wo ->
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = SuccessGreen.copy(alpha = 0.1f),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = SuccessGreen)
                        Spacer(Modifier.width(8.dp))
                        Text("Submitted — $wo",
                            style = MaterialTheme.typography.bodyMedium,
                            color = VairiotCharcoal, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { viewModel.clearLastWorkOrder() }) { Text("OK") }
                    }
                }
            }

            // Event list
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.events, key = { it.id }) { event ->
                    MaintenanceEventRow(event = event, onClick = { onEventClick(event.id) })
                }
                item { Spacer(Modifier.height(80.dp)) }
            }
        }

        // FAB for reporting new maintenance
        if (canWrite) {
            FloatingActionButton(
                onClick = { viewModel.showReportForm() },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
                containerColor = VairiotViolet,
                contentColor = White,
            ) {
                Icon(Icons.Default.Add, contentDescription = "Report maintenance")
            }
        }

        if (state.showCamera) {
            CameraBarcodeScannerScreen(
                onBarcodeScanned = { viewModel.onCameraBarcodeScanned(it) },
                onDismiss = { viewModel.closeCameraFallback() },
            )
        }

        if (state.showReportForm) {
            ReportMaintenanceDialog(
                state = state,
                viewModel = viewModel,
                onDismiss = { viewModel.hideReportForm() },
            )
        }
    }
}

@Composable
private fun MaintenanceStatusFilter(
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Status", style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        STATUS_FILTERS.forEach { option ->
            val isSelected = selected.equals(option, ignoreCase = true)
            val bg by animateColorAsState(
                if (isSelected) VairiotViolet else MaterialTheme.colorScheme.surfaceVariant,
                label = "chipBg",
            )
            val fg by animateColorAsState(
                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                label = "chipFg",
            )
            Surface(onClick = { onSelect(option) }, color = bg, shape = RoundedCornerShape(8.dp)) {
                Text(
                    option.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = fg,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
private fun MaintenanceEventRow(event: MaintenanceEventResponse, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        event.asset?.let { "${it.assetNumber} — ${it.name}" }
                            ?: event.assetId,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = VairiotCharcoal,
                        maxLines = 1,
                    )
                }
                Spacer(Modifier.width(8.dp))
                MaintenanceStatusBadge(event.status)
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    color = VairiotViolet.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(4.dp),
                ) {
                    Text(
                        event.maintenanceType.replaceFirstChar { it.uppercase() },
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = VairiotViolet,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                event.workOrderNumber?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                }
            }
            event.description?.let {
                Text(it, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    maxLines = 2)
            }
            event.scheduledDate?.let {
                Text("Scheduled: ${formatDate(it)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            }
        }
    }
}

@Composable
fun MaintenanceStatusBadge(status: String) {
    val (bg, fg) = when (status.lowercase()) {
        "scheduled"   -> VairiotViolet.copy(alpha = 0.15f) to VairiotViolet
        "in_progress" -> WarningAmber.copy(alpha = 0.15f)  to WarningAmber
        "completed"   -> SuccessGreen.copy(alpha = 0.15f)  to SuccessGreen
        "cancelled"   -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        else          -> VairiotMauve.copy(alpha = 0.15f)  to VairiotMauve
    }
    Surface(color = bg, shape = RoundedCornerShape(6.dp)) {
        Text(
            status.replace('_', ' ').uppercase(),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fg, fontWeight = FontWeight.SemiBold,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportMaintenanceDialog(
    state: MaintenanceListUiState,
    viewModel: MaintenanceListViewModel,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    var captureUri by remember { mutableStateOf<Uri?>(null) }
    var permissionError by remember { mutableStateOf<String?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = captureUri
        if (success && uri != null) viewModel.setReportPhoto(uri)
        captureUri = null
    }

    fun launchCamera() {
        permissionError = null
        try {
            val dir = File(context.cacheDir, "maintenance").apply { mkdirs() }
            val file = File(dir, "maint-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report Maintenance", fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Asset search with scan icon
                var showScanMenu by remember { mutableStateOf(false) }
                OutlinedTextField(
                    value = state.assetSearchQuery,
                    onValueChange = { viewModel.searchAssets(it) },
                    label = { Text("Search asset") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        Box {
                            IconButton(onClick = { showScanMenu = true },
                                enabled = !state.isScanning) {
                                if (state.isScanning) {
                                    CircularProgressIndicator(color = VairiotViolet,
                                        modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Default.QrCodeScanner,
                                        contentDescription = "Scan barcode / RFID",
                                        tint = VairiotViolet)
                                }
                            }
                            DropdownMenu(
                                expanded = showScanMenu,
                                onDismissRequest = { showScanMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("RFID") },
                                    leadingIcon = { Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                    onClick = { showScanMenu = false; viewModel.triggerScan() },
                                    enabled = viewModel.supportsRfid,
                                )
                                DropdownMenuItem(
                                    text = { Text("Barcode") },
                                    leadingIcon = { Icon(Icons.Default.QrCode2, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                    onClick = { showScanMenu = false; viewModel.triggerBarcodeScan() },
                                    enabled = viewModel.supportsBarcode,
                                )
                                if (viewModel.supportsCameraScan) {
                                    DropdownMenuItem(
                                        text = { Text("Camera") },
                                        leadingIcon = { Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                        onClick = { showScanMenu = false; viewModel.openCameraFallback() },
                                    )
                                }
                            }
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.assetSearchResults.isNotEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column {
                            state.assetSearchResults.take(5).forEach { asset ->
                                Surface(
                                    onClick = { viewModel.selectReportAsset(asset) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(
                                        "${asset.assetNumber} — ${asset.name}",
                                        modifier = Modifier.padding(12.dp),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                                if (asset != state.assetSearchResults.last()) {
                                    HorizontalDivider()
                                }
                            }
                        }
                    }
                }
                state.scanError?.let {
                    Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                }

                // Type chips
                Text("Type", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MAINTENANCE_TYPES.forEach { (value, label) ->
                        FilterChip(
                            selected = state.reportType == value,
                            onClick = { viewModel.setReportType(value) },
                            label = { Text(label) },
                        )
                    }
                }

                ClearableTextField(
                    value = state.reportNotes,
                    onValueChange = { viewModel.setReportNotes(it) },
                    label = { Text("What needs doing?") },
                    placeholder = { Text("Describe the fault…") },
                    singleLine = false,
                    minLines = 3,
                    maxLines = 6,
                )

                // Photo
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

                state.reportPhotoUri?.let { uri ->
                    Box(modifier = Modifier.size(100.dp)) {
                        AsyncImage(
                            model = uri,
                            contentDescription = "Photo",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)),
                        )
                        IconButton(
                            onClick = { viewModel.setReportPhoto(null) },
                            modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                        ) {
                            Surface(shape = RoundedCornerShape(50), color = White.copy(alpha = 0.85f)) {
                                Icon(Icons.Default.Close, contentDescription = "Remove",
                                    tint = ErrorRed, modifier = Modifier.padding(2.dp).size(16.dp))
                            }
                        }
                    }
                }

                permissionError?.let {
                    Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                }
                state.submitError?.let {
                    Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { viewModel.submitReport() },
                enabled = !state.isSubmitting && state.reportNotes.isNotBlank() && state.reportAssetId.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(color = White, strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text("Submit")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

internal fun formatDate(isoDate: String): String {
    return try {
        val parser = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.UK).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        val formatter = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK)
        val date = parser.parse(isoDate.take(10))
        date?.let { formatter.format(it) } ?: isoDate.take(10)
    } catch (_: Exception) {
        isoDate.take(10)
    }
}
