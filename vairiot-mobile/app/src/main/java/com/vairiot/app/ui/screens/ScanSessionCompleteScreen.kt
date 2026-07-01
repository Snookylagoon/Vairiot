package com.vairiot.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.domain.model.SessionSnapshot
import com.vairiot.app.ui.theme.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val WHEN_FMT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault())

@Composable
fun ScanSessionCompleteScreen(
    onDone: () -> Unit,
    viewModel: ScanSessionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val ctx = LocalContext.current

    // Ensure completion has been triggered (idempotent — no-op if already done).
    LaunchedEffect(viewModel.sessionId) {
        viewModel.completeSession { }
    }

    val snapshot = (state as? ScanSessionUiState.Completed)?.snapshot
        ?: (state as? ScanSessionUiState.Completing)?.snapshot

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(modifier = Modifier.fillMaxWidth()
            .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null,
                    tint = SuccessGreen, modifier = Modifier.size(28.dp))
                Spacer(Modifier.width(12.dp))
                Text("Scan completed",
                    style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily,
                    fontWeight = FontWeight.ExtraBold,
                    color = White)
            }
        }

        if (snapshot == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Column
        }

        Column(modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {

            Card(shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
                Column(modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    CountRow("Known assets",   snapshot.knownCount,   SuccessGreen)
                    CountRow("New tags",       snapshot.newCount,     VairiotViolet)
                    CountRow("Missing assets", snapshot.missingCount, ErrorRed)
                    CountRow("Ignored tags",   snapshot.ignoredCount, VairiotCharcoal.copy(alpha = 0.55f))
                }
            }

            Button(
                onClick = {
                    val text = buildReport(snapshot)
                    ctx.startActivity(Intent.createChooser(
                        Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "Vairiot scan session ${snapshot.sessionId}")
                            putExtra(Intent.EXTRA_TEXT, text)
                        },
                        "Export report",
                    ))
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                Icon(Icons.Default.IosShare, contentDescription = null,
                    modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Export report")
            }

            Spacer(Modifier.weight(1f))

            Button(
                onClick = onDone,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
            ) {
                Text("Close session", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun CountRow(label: String, count: Int, accent: Color) {
    Row(modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium,
            color = VairiotCharcoal, modifier = Modifier.weight(1f))
        Text(count.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.ExtraBold,
            color = accent)
    }
}

private fun buildReport(snapshot: SessionSnapshot): String = buildString {
    appendLine("Vairiot RFID scan session")
    appendLine("Session ID: ${snapshot.sessionId}")
    appendLine("Generated: ${WHEN_FMT.format(Instant.now())}")
    appendLine()
    appendLine("Known:   ${snapshot.knownCount}")
    appendLine("New:     ${snapshot.newCount}")
    appendLine("Missing: ${snapshot.missingCount}")
    appendLine("Ignored: ${snapshot.ignoredCount}")
    if (snapshot.missing.isNotEmpty()) {
        appendLine()
        appendLine("Missing assets:")
        snapshot.missing.forEach { t ->
            appendLine("  • ${t.asset?.assetNumber ?: t.epc} — ${t.asset?.name ?: "(no name)"}")
        }
    }
    if (snapshot.newTags.isNotEmpty()) {
        appendLine()
        appendLine("New tags:")
        snapshot.newTags.forEach { appendLine("  • ${it.epc}") }
    }
}
