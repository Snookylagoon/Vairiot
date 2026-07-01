package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DoNotDisturbOn
import androidx.compose.material.icons.filled.FiberNew
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.domain.model.SessionSnapshot
import com.vairiot.app.domain.model.SessionTag
import com.vairiot.app.scanner.ScannerHealth
import com.vairiot.app.ui.components.ClearableTextField
import com.vairiot.app.ui.theme.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val TIME_FMT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault())

private enum class SessionTab(val label: String) {
    KNOWN("Known"), NEW("New"), MISSING("Missing"), IGNORED("Ignored")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanSessionScreen(
    onBack:       () -> Unit,
    onComplete:   (sessionId: String) -> Unit,
    onAssetClick: (assetId: String) -> Unit = {},
    viewModel: ScanSessionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val health by viewModel.scannerHealth.collectAsState()
    val registerTarget by viewModel.registerTarget.collectAsState()
    val assignTarget by viewModel.assignTarget.collectAsState()
    val assignableAssets by viewModel.assignableAssets.collectAsState()
    var currentTab by rememberSaveable { mutableStateOf(SessionTab.KNOWN) }

    val snapshot: SessionSnapshot? = when (val s = state) {
        is ScanSessionUiState.Active     -> s.snapshot
        is ScanSessionUiState.Completing -> s.snapshot
        is ScanSessionUiState.Completed  -> { LaunchedEffect(s) { onComplete(viewModel.sessionId) }; s.snapshot }
        else -> null
    }

    Scaffold(
        topBar = { SessionTopBar(onBack, health, viewModel::retryScannerRecovery) },
        bottomBar = { SessionBottomBar(
            onScan = { viewModel.triggerScan() },
            onStop = { viewModel.stopScan() },
            onComplete = { viewModel.completeSession { onComplete(viewModel.sessionId) } },
            isCompleting = state is ScanSessionUiState.Completing,
        )},
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val s = state) {
                is ScanSessionUiState.Loading -> LoadingBody()
                is ScanSessionUiState.Error   -> ErrorBody(s.message)
                else -> if (snapshot != null) {
                    SummaryCards(snapshot)
                    SessionTabs(currentTab, onTab = { currentTab = it }, snapshot)
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        when (currentTab) {
                            SessionTab.KNOWN   -> KnownList(
                                items = snapshot.known,
                                onAssetClick = onAssetClick,
                            )
                            SessionTab.NEW     -> NewList(
                                items       = snapshot.newTags,
                                onRegister  = { viewModel.openRegister(it.epc) },
                                onAssign    = { viewModel.openAssign(it.epc) },
                                onIgnore    = { viewModel.ignoreTag(it.epc) },
                            )
                            SessionTab.MISSING -> MissingList(snapshot.missing, snapshot.isComplete)
                            SessionTab.IGNORED -> IgnoredList(snapshot.ignored)
                        }
                    }
                }
            }
        }
    }

    val target = registerTarget
    if (target != null) {
        RegisterAssetDialog(
            epc      = target,
            onCancel = { viewModel.closeRegister() },
            onConfirm = { name -> viewModel.registerNewAsset(target, name) },
        )
    }

    val assignEpc = assignTarget
    if (assignEpc != null) {
        AssignAssetDialog(
            epc      = assignEpc,
            assets   = assignableAssets,
            onCancel = { viewModel.closeAssign() },
            onSelect = { assetId -> viewModel.assignExistingAsset(assignEpc, assetId) },
        )
    }
}

@Composable
private fun AssignAssetDialog(
    epc: String,
    assets: List<AssetResponse>,
    onCancel: () -> Unit,
    onSelect: (assetId: String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(assets, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) assets
        else assets.filter {
            it.name.lowercase().contains(q) ||
            it.assetNumber.lowercase().contains(q) ||
            it.barcode?.lowercase()?.contains(q) == true
        }
    }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Assign to existing asset",
            fontFamily = MontserratFamily, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Link this EPC to an existing asset:",
                    style = MaterialTheme.typography.labelSmall,
                    color = VairiotCharcoal.copy(alpha = 0.6f))
                Text(epc, style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold)
                ClearableTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search by name or number") },
                    singleLine = true,
                )
                if (filtered.isEmpty()) {
                    Text("No matching assets.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                } else {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(filtered.take(50), key = { it.id }) { asset ->
                            Surface(
                                onClick = { onSelect(asset.id) },
                                shape = RoundedCornerShape(8.dp),
                                color = VairiotWash,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text(asset.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = VairiotCharcoal,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(asset.assetNumber,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = VairiotCharcoal.copy(alpha = 0.6f))
                                    if (!asset.rfidTag.isNullOrBlank()) {
                                        Text("Existing tag: ${asset.rfidTag}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = WarningAmber,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onCancel) { Text("Cancel") } },
        dismissButton = null,
    )
}

@Composable
private fun SessionTopBar(
    onBack: () -> Unit,
    health: ScannerHealth,
    onRetry: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth()
        .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
        .statusBarsPadding()
        .padding(horizontal = 8.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back", tint = White)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("RFID Scan Active",
                    style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily,
                    fontWeight = FontWeight.ExtraBold,
                    color = White)
                Text(
                    when (health) {
                        ScannerHealth.READY       -> "Reader connected"
                        ScannerHealth.RECOVERING  -> "Reader recovering…"
                        ScannerHealth.UNAVAILABLE -> "Reader offline"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = White.copy(alpha = 0.75f),
                )
            }
            if (health != ScannerHealth.READY) {
                TextButton(onClick = onRetry) {
                    Text("Retry", color = WarningAmber, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun SummaryCards(snapshot: SessionSnapshot) {
    Row(modifier = Modifier.fillMaxWidth()
        .padding(horizontal = 12.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SummaryCard("Known",   snapshot.knownCount,   SuccessGreen,   Modifier.weight(1f))
        SummaryCard("New",     snapshot.newCount,     VairiotViolet,  Modifier.weight(1f))
        SummaryCard("Missing", snapshot.missingCount, ErrorRed,       Modifier.weight(1f))
        SummaryCard("Ignored", snapshot.ignoredCount, VairiotCharcoal.copy(alpha = 0.55f), Modifier.weight(1f))
    }
}

@Composable
private fun SummaryCard(label: String, count: Int, accent: Color, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = accent.copy(alpha = 0.10f),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(count.toString(),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.ExtraBold,
                color = accent)
            Text(label,
                style = MaterialTheme.typography.labelSmall,
                color = accent,
                fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SessionTabs(
    current: SessionTab,
    onTab: (SessionTab) -> Unit,
    snapshot: SessionSnapshot,
) {
    val counts = mapOf(
        SessionTab.KNOWN   to snapshot.knownCount,
        SessionTab.NEW     to snapshot.newCount,
        SessionTab.MISSING to snapshot.missingCount,
        SessionTab.IGNORED to snapshot.ignoredCount,
    )
    TabRow(selectedTabIndex = current.ordinal, containerColor = VairiotWash) {
        SessionTab.entries.forEach { tab ->
            Tab(
                selected = current == tab,
                onClick  = { onTab(tab) },
                text = {
                    Text("${tab.label} (${counts[tab] ?: 0})",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
                        fontWeight = if (current == tab) FontWeight.Bold else FontWeight.Normal)
                },
            )
        }
    }
}

@Composable
private fun KnownList(
    items: List<SessionTag>,
    onAssetClick: (assetId: String) -> Unit,
) {
    if (items.isEmpty()) {
        EmptyRow("No registered assets scanned yet.", Icons.Default.CheckCircle, SuccessGreen)
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items, key = { it.epc }) { tag ->
            val assetId = tag.asset?.id
            Surface(
                color = SuccessGreen.copy(alpha = 0.08f),
                shape = RoundedCornerShape(10.dp),
                onClick = { if (!assetId.isNullOrBlank()) onAssetClick(assetId) },
                enabled = !assetId.isNullOrBlank(),
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null,
                        tint = SuccessGreen, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tag.asset?.name ?: tag.epc,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = VairiotCharcoal)
                        Text("Asset ID: ${tag.asset?.assetNumber ?: "—"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = VairiotCharcoal.copy(alpha = 0.6f))
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Seen ${formatTime(tag.lastSeenMs)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = SuccessGreen,
                            fontWeight = FontWeight.SemiBold)
                        Text("Reads ${tag.readCount}",
                            style = MaterialTheme.typography.labelSmall,
                            color = VairiotCharcoal.copy(alpha = 0.6f))
                    }
                }
            }
        }
    }
}

@Composable
private fun NewList(
    items: List<SessionTag>,
    onRegister: (SessionTag) -> Unit,
    onAssign: (SessionTag) -> Unit,
    onIgnore: (SessionTag) -> Unit,
) {
    if (items.isEmpty()) {
        EmptyRow("No new tags detected.", Icons.Default.FiberNew, VairiotViolet)
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items, key = { it.epc }) { tag ->
            Surface(color = VairiotViolet.copy(alpha = 0.08f), shape = RoundedCornerShape(10.dp)) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.FiberNew, contentDescription = null,
                            tint = VairiotViolet, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Unregistered RFID tag",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = VairiotCharcoal)
                            Text(tag.epc,
                                style = MaterialTheme.typography.labelSmall,
                                color = VairiotCharcoal.copy(alpha = 0.7f))
                        }
                        Text("First ${formatTime(tag.firstSeenMs)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = VairiotViolet,
                            fontWeight = FontWeight.SemiBold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Button(onClick = { onRegister(tag) },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = VairiotPink)) {
                            Text("Register", style = MaterialTheme.typography.labelSmall,
                                maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
                        }
                        OutlinedButton(onClick = { onAssign(tag) },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)) {
                            Text("Assign", style = MaterialTheme.typography.labelSmall,
                                maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
                        }
                        OutlinedButton(onClick = { onIgnore(tag) },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)) {
                            Text("Ignore", style = MaterialTheme.typography.labelSmall,
                                maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MissingList(items: List<SessionTag>, isComplete: Boolean) {
    if (items.isEmpty()) {
        val label = if (isComplete) "No missing assets — nothing was expected but unfound."
                    else "Missing assets appear when you complete the session."
        EmptyRow(label, Icons.Default.SearchOff, ErrorRed)
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items, key = { it.epc }) { tag ->
            Surface(color = ErrorRed.copy(alpha = 0.08f), shape = RoundedCornerShape(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.SearchOff, contentDescription = null,
                        tint = ErrorRed, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tag.asset?.name ?: tag.epc,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = VairiotCharcoal)
                        Text("Asset ID: ${tag.asset?.assetNumber ?: "—"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = VairiotCharcoal.copy(alpha = 0.6f))
                        val loc = tag.asset?.location?.name
                        if (!loc.isNullOrBlank()) {
                            Text("Expected: $loc",
                                style = MaterialTheme.typography.labelSmall,
                                color = ErrorRed)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IgnoredList(items: List<SessionTag>) {
    if (items.isEmpty()) {
        EmptyRow("No ignored tags.", Icons.Default.RemoveCircle, VairiotCharcoal.copy(alpha = 0.55f))
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(items, key = { it.epc }) { tag ->
            Surface(color = VairiotCharcoal.copy(alpha = 0.06f), shape = RoundedCornerShape(8.dp)) {
                Row(modifier = Modifier.fillMaxWidth().padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.RemoveCircle, contentDescription = null,
                        tint = VairiotCharcoal.copy(alpha = 0.55f), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(tag.epc, style = MaterialTheme.typography.bodySmall,
                        color = VairiotCharcoal.copy(alpha = 0.75f),
                        modifier = Modifier.weight(1f))
                    tag.ignoredAtMs?.let {
                        Text("Ignored ${formatTime(it)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = VairiotCharcoal.copy(alpha = 0.5f))
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyRow(msg: String, icon: ImageVector, tint: Color) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center) {
        Icon(icon, contentDescription = null, tint = tint.copy(alpha = 0.5f),
            modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(msg, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

@Composable
private fun LoadingBody() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorBody(msg: String) {
    Column(modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center) {
        Icon(Icons.Default.SearchOff, contentDescription = null,
            tint = ErrorRed, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(msg, style = MaterialTheme.typography.bodyMedium, color = ErrorRed)
    }
}

@Composable
private fun SessionBottomBar(
    onScan: () -> Unit,
    onStop: () -> Unit,
    onComplete: () -> Unit,
    isCompleting: Boolean,
) {
    Surface(shadowElevation = 6.dp) {
        Row(modifier = Modifier.fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = onScan,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
                enabled = !isCompleting,
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                    modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Scan", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
            }
            OutlinedButton(
                onClick = onStop,
                modifier = Modifier.height(52.dp),
                enabled = !isCompleting,
            ) {
                Icon(Icons.Default.StopCircle, contentDescription = "Stop",
                    modifier = Modifier.size(20.dp))
            }
            Button(
                onClick = onComplete,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                enabled = !isCompleting,
            ) {
                if (isCompleting) {
                    CircularProgressIndicator(color = White, strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp))
                } else {
                    Text("Complete", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun RegisterAssetDialog(
    epc: String,
    onCancel: () -> Unit,
    onConfirm: (name: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Register asset", fontFamily = MontserratFamily,
            fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("EPC:", style = MaterialTheme.typography.labelSmall,
                    color = VairiotCharcoal.copy(alpha = 0.6f))
                Text(epc, style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold)
                ClearableTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Asset name") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(name.trim()) },
                enabled = name.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
            ) { Text("Register") }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } },
    )
}

private fun formatTime(ms: Long): String =
    if (ms <= 0) "—" else TIME_FMT.format(Instant.ofEpochMilli(ms))
