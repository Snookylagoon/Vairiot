package com.vairiot.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.BuildConfig
import com.vairiot.app.LocalUseSideRail
import com.vairiot.app.ui.theme.*

@Composable
fun ProfileScreen(
    onLogout: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val uploads by viewModel.pendingUploads.collectAsState()
    val context = LocalContext.current
    val sideRail = LocalUseSideRail.current

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        if (!sideRail) {
            Box(
                modifier = Modifier.fillMaxWidth()
                    .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                    .padding(16.dp),
            ) {
                Column {
                    Text("Profile", color = androidx.compose.ui.graphics.Color.White,
                        fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    if (state.tenantName != null) {
                        Text(state.tenantName!!, color = androidx.compose.ui.graphics.Color.White,
                            fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Text(state.email ?: "—", color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f),
                        fontSize = 14.sp)
                }
            }
        }

        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.isLoading && state.licenceNumber == null) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            if (state.offline) {
                AssistChip(onClick = {}, label = { Text("Offline — showing last known licence") })
            }

            LicenceCard(
                number    = state.licenceNumber,
                tier      = state.licenceTier,
                status    = state.licenceStatus,
                startDate = state.licenceStart,
                onCopy = { num ->
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("Licence number", num))
                    Toast.makeText(context, "Licence number copied", Toast.LENGTH_SHORT).show()
                },
            )

            if (state.roles.isNotEmpty()) {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Roles", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        Text(state.roles.joinToString(", "), fontWeight = FontWeight.Medium)
                    }
                }
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            if (uploads.total > 0) {
                PendingUploadsCard(
                    uploads      = uploads,
                    onSyncNow    = viewModel::syncNow,
                    onRetry      = viewModel::retryUpload,
                    onRetryAll   = viewModel::retryAllRejected,
                    onDiscard    = viewModel::discardUpload,
                    onDiscardAll = viewModel::discardAllRejected,
                )
            }

            Spacer(Modifier.weight(1f))

            AppVersionCard(
                updateState  = state.update,
                onCheck      = viewModel::checkForUpdates,
                onInstall    = viewModel::installUpdate,
                onNotNow     = viewModel::deferUpdate,
            )

            OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out")
            }
        }
    }

    // Transient feedback (up to date / offline / deferred / install failed) as a toast.
    LaunchedEffect(state.update) {
        val message = when (state.update) {
            UpdateUiState.UpToDate      -> "You're on the latest version"
            UpdateUiState.Failed        -> "Couldn't check for updates. Try again later."
            UpdateUiState.Deferred      -> "Update will be installed on your next sign in"
            UpdateUiState.InstallFailed -> "Update failed. Please try again."
            else                        -> null
        }
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            viewModel.dismissUpdateMessage()
        }
    }
}

/** Rejected rows listed individually; the rest are summarised to keep the card short. */
private const val MAX_DEAD_ROWS_SHOWN = 3

/**
 * Work saved on this device that the server doesn't have yet. Nothing here is
 * ever deleted automatically: waiting and retrying rows sync on their own, and
 * rejected rows stay until the user retries or discards them.
 */
@Composable
private fun PendingUploadsCard(
    uploads:      PendingUploads,
    onSyncNow:    () -> Unit,
    onRetry:      (DeadUpload) -> Unit,
    onRetryAll:   () -> Unit,
    onDiscard:    (DeadUpload) -> Unit,
    onDiscardAll: () -> Unit,
) {
    // null = no dialog; empty list = "discard all"; one item = that row.
    var confirmDiscard by remember { mutableStateOf<List<DeadUpload>?>(null) }
    val hasRejected = uploads.dead.isNotEmpty()

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = if (hasRejected) {
            CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Pending uploads", fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)

            QueueCountRow("Audit scans", uploads.scans)
            QueueCountRow("New assets", uploads.assets)
            QueueCountRow("Photos", uploads.photos)

            uploads.dead.take(MAX_DEAD_ROWS_SHOWN).forEach { item ->
                HorizontalDivider()
                Text(item.label, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                item.error?.let {
                    Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { onRetry(item) }) { Text("Retry") }
                    TextButton(onClick = { confirmDiscard = listOf(item) }) { Text("Discard") }
                }
            }
            val hidden = uploads.dead.size - MAX_DEAD_ROWS_SHOWN
            if (hidden > 0) {
                Text("…and $hidden more rejected item${if (hidden == 1) "" else "s"}", fontSize = 12.sp)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (hasRejected) {
                    Button(onClick = onRetryAll) { Text("Retry all") }
                    OutlinedButton(onClick = { confirmDiscard = emptyList() }) { Text("Discard all") }
                } else {
                    OutlinedButton(onClick = onSyncNow) { Text("Sync now") }
                }
            }
        }
    }

    confirmDiscard?.let { target ->
        val count = if (target.isEmpty()) uploads.dead.size else 1
        AlertDialog(
            onDismissRequest = { confirmDiscard = null },
            title = { Text(if (count == 1) "Discard this item?" else "Discard $count items?") },
            text = {
                Text("${if (count == 1) "It" else "They"} will be permanently deleted from this device " +
                    "and will never reach the server.")
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDiscard = null
                    if (target.isEmpty()) onDiscardAll() else onDiscard(target.first())
                }) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDiscard = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun QueueCountRow(label: String, counts: QueueCounts) {
    if (counts.total == 0) return
    val parts = buildList {
        if (counts.pending > 0) add("${counts.pending} waiting")
        if (counts.failed > 0) add("${counts.failed} retrying")
        if (counts.dead > 0) add("${counts.dead} rejected")
    }
    Row(Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), fontSize = 14.sp)
        Text(
            parts.joinToString(" · "),
            fontSize = 14.sp,
            color = if (counts.dead > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun AppVersionCard(
    updateState: UpdateUiState,
    onCheck:     () -> Unit,
    onInstall:   () -> Unit,
    onNotNow:    () -> Unit,
) {
    val busy = updateState is UpdateUiState.Checking || updateState is UpdateUiState.Downloading

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("App version", fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Released", fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(BuildConfig.BUILD_DATE, fontWeight = FontWeight.Medium)
                }
            }

            Spacer(Modifier.height(4.dp))

            OutlinedButton(
                onClick = onCheck,
                enabled = !busy,
                shape = RoundedCornerShape(50),
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(if (updateState is UpdateUiState.Downloading) "Downloading…" else "Checking…")
                } else {
                    Text("Check for updates")
                }
            }
        }
    }

    if (updateState is UpdateUiState.Available) {
        val info = updateState.info
        AlertDialog(
            onDismissRequest = onNotNow,
            title   = { Text("Update available") },
            text    = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Version ${info.versionName ?: ""} (build ${info.versionCode}) is ready to install.",
                    )
                    info.releaseNotes?.takeIf { it.isNotBlank() }?.let {
                        Text(it, fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
            confirmButton = { TextButton(onClick = onInstall) { Text("Install") } },
            dismissButton = { TextButton(onClick = onNotNow) { Text("Not now") } },
        )
    }
}

@Composable
private fun LicenceCard(
    number: String?,
    tier: String?,
    status: String?,
    startDate: String?,
    onCopy: (String) -> Unit,
) {
    val formattedStart = startDate
        ?.let { runCatching { java.time.OffsetDateTime.parse(it).toLocalDate().toString() }.getOrNull() }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Licence number", fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    number ?: "—",
                    fontFamily = MontserratFamily,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.weight(1f))
                if (number != null) {
                    TextButton(onClick = { onCopy(number) }) { Text("Copy") }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                tier?.let {
                    Column {
                        Text("Tier", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it, fontWeight = FontWeight.Medium)
                    }
                }
                status?.let {
                    Column {
                        Text("Status", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it.uppercase(), fontWeight = FontWeight.Medium)
                    }
                }
                formattedStart?.let {
                    Column {
                        Text("Start date", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
