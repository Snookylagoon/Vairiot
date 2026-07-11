package com.vairiot.app.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bolt
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import com.vairiot.app.ui.components.PressableButton
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
    val isScanning by viewModel.isScanning.collectAsState()
    val liveTagsSeen by viewModel.liveTagsSeen.collectAsState()
    val powerDbm by viewModel.powerDbm.collectAsState()
    val registerTarget by viewModel.registerTarget.collectAsState()
    val assignTarget by viewModel.assignTarget.collectAsState()
    val assignableAssets by viewModel.assignableAssets.collectAsState()
    var currentTab by rememberSaveable { mutableStateOf(SessionTab.KNOWN) }

    LaunchedEffect(health) {
        if (health == ScannerHealth.READY) viewModel.refreshPower()
    }

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
            val powerRange = viewModel.powerRangeDbm
            if (viewModel.supportsPowerControl && powerRange != null) {
                PowerControlRow(
                    dbm = powerDbm,
                    range = powerRange,
                    onChange = { viewModel.setPower(it) },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
            when (val s = state) {
                is ScanSessionUiState.Loading -> LoadingBody()
                is ScanSessionUiState.Error   -> ErrorBody(s.message)
                else -> if (snapshot != null) {
                    SummaryCards(
                        snapshot = snapshot,
                        current  = currentTab,
                        onTab    = { currentTab = it },
                    )
                    if (isScanning) {
                        ScanningIndicator(
                            tagsSeen = liveTagsSeen,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                        Spacer(Modifier.height(8.dp))
                    }
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
private fun SummaryCards(
    snapshot: SessionSnapshot,
    current:  SessionTab,
    onTab:    (SessionTab) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth()
        .padding(horizontal = 12.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SummaryCard(SessionTab.KNOWN,   snapshot.knownCount,   SuccessGreen,
            current, onTab, Modifier.weight(1f))
        SummaryCard(SessionTab.NEW,     snapshot.newCount,     VairiotViolet,
            current, onTab, Modifier.weight(1f))
        SummaryCard(SessionTab.MISSING, snapshot.missingCount, ErrorRed,
            current, onTab, Modifier.weight(1f))
        SummaryCard(SessionTab.IGNORED, snapshot.ignoredCount, VairiotCharcoal.copy(alpha = 0.55f),
            current, onTab, Modifier.weight(1f))
    }
}

@Composable
private fun SummaryCard(
    tab: SessionTab,
    count: Int,
    accent: Color,
    current: SessionTab,
    onTab: (SessionTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val selected = current == tab
    Surface(
        onClick = { onTab(tab) },
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) accent.copy(alpha = 0.24f) else accent.copy(alpha = 0.10f),
        border = if (selected) BorderStroke(2.dp, accent) else null,
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(count.toString(),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.ExtraBold,
                color = accent)
            Text(tab.label,
                style = MaterialTheme.typography.labelSmall,
                color = accent,
                maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
                fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold)
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
private fun ScanningIndicator(tagsSeen: Int, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "rfidSweep")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1400, easing = LinearEasing)),
        label = "rfidSweepPulse",
    )

    Surface(
        color = VairiotPink.copy(alpha = 0.08f),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
                listOf(pulse, (pulse + 0.5f) % 1f).forEach { phase ->
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .graphicsLayer {
                                val s = 0.3f + phase * 0.7f
                                scaleX = s
                                scaleY = s
                                alpha = (1f - phase).coerceIn(0f, 1f)
                            }
                            .clip(CircleShape)
                            .background(VairiotPink),
                    )
                }
                Box(
                    modifier = Modifier.size(18.dp).clip(CircleShape).background(VairiotPink),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                        tint = White, modifier = Modifier.size(12.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Searching for tags…",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = VairiotCharcoal)
                Text(
                    if (tagsSeen == 0) "No tags detected yet"
                    else "$tagsSeen tag${if (tagsSeen == 1) "" else "s"} detected",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (tagsSeen == 0) VairiotCharcoal.copy(alpha = 0.6f) else VairiotPink,
                    fontWeight = if (tagsSeen == 0) FontWeight.Normal else FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun PowerControlRow(
    dbm: Int?,
    range: IntRange,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = VairiotViolet.copy(alpha = 0.06f),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier,
    ) {
        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Bolt, contentDescription = null,
                tint = VairiotViolet, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Power", style = MaterialTheme.typography.labelSmall,
                color = VairiotCharcoal.copy(alpha = 0.7f))
            Slider(
                value = (dbm ?: range.last).toFloat(),
                onValueChange = { onChange(it.toInt()) },
                valueRange = range.first.toFloat()..range.last.toFloat(),
                steps = (range.last - range.first - 1).coerceAtLeast(0),
                enabled = dbm != null,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                colors = SliderDefaults.colors(thumbColor = VairiotViolet, activeTrackColor = VairiotViolet),
            )
            Text(
                if (dbm != null) "$dbm dBm" else "…",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = VairiotCharcoal,
                modifier = Modifier.widthIn(min = 40.dp),
            )
        }
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
            PressableButton(
                onClick = onScan,
                modifier = Modifier.weight(1f),
                baseColor = VairiotPink,
                height = 52.dp,
                enabled = !isCompleting,
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                    modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Scan", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
            }
            PressableButton(
                onClick = onStop,
                height = 52.dp,
                enabled = !isCompleting,
            ) {
                Icon(Icons.Default.StopCircle, contentDescription = "Stop",
                    modifier = Modifier.size(20.dp))
            }
            PressableButton(
                onClick = onComplete,
                modifier = Modifier.weight(1f),
                baseColor = SuccessGreen,
                height = 52.dp,
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
