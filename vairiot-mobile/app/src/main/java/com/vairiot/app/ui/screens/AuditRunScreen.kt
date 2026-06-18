package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AuditRunScreen(
    onBack: () -> Unit,
    viewModel: AuditRunViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var manual by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        // Header
        Box(modifier = Modifier.fillMaxWidth()
            .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
            .padding(horizontal = 8.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back", tint = White)
                }
                Column {
                    Text("Run audit", style = MaterialTheme.typography.titleLarge,
                        fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                        color = White)
                    Text("Found ${state.foundCount} · Unknown ${state.unknownCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = White.copy(alpha = 0.7f))
                }
            }
        }

        // Report view if completed
        state.report?.let { report ->
            ReportBody(report = report, onBack = onBack)
            return
        }

        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            // Manual entry + scan button
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = manual, onValueChange = { manual = it },
                    label = { Text("Tag value") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { viewModel.submitTag(manual); manual = "" },
                    enabled = manual.isNotBlank() && !state.isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                ) { Text("Record") }
            }

            Button(
                onClick = { viewModel.triggerScan() },
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                    modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Scan tag", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
            }

            state.lastMessage?.let {
                Surface(color = VairiotWash, shape = RoundedCornerShape(8.dp)) {
                    Text(it, modifier = Modifier.padding(10.dp),
                        style = MaterialTheme.typography.bodySmall, color = VairiotCharcoal)
                }
            }
            state.error?.let {
                Surface(color = ErrorRed.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                    Text(it, modifier = Modifier.padding(10.dp),
                        style = MaterialTheme.typography.bodySmall, color = ErrorRed)
                }
            }

            Button(
                onClick = { viewModel.complete() },
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
            ) { Text("Complete audit") }

            HorizontalDivider()
            Text("Recent scans", style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)

            if (state.recentScans.isEmpty()) {
                Text("No scans recorded yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }

            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(state.recentScans, key = { it.id }) { ScanEventRow(it) }
            }
        }
    }
}

@Composable
private fun ScanEventRow(ev: AuditScanEventResponse) {
    val isFound = ev.result == "found"
    Surface(color = if (isFound) SuccessGreen.copy(alpha = 0.08f)
                     else        WarningAmber.copy(alpha = 0.10f),
        shape = RoundedCornerShape(8.dp)) {
        Row(modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(
                imageVector = if (isFound) Icons.Default.CheckCircle else Icons.Default.SearchOff,
                contentDescription = null,
                tint = if (isFound) SuccessGreen else WarningAmber,
                modifier = Modifier.size(18.dp),
            )
            Text(ev.tagValue, style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(ev.result.uppercase(), style = MaterialTheme.typography.labelSmall,
                color = if (isFound) SuccessGreen else WarningAmber)
        }
    }
}

@Composable
private fun ReportBody(report: AuditReportResponse, onBack: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Audit complete", style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, color = VairiotCharcoal)
                DetailRow("Expected", report.totalExpected.toString())
                DetailRow("Scanned",  report.totalScanned.toString())
                DetailRow("Found",    report.found.toString())
                DetailRow("Missing",  report.missing.size.toString())
                DetailRow("Unknown",  report.unknownTags.size.toString())
            }
        }
        if (report.missing.isNotEmpty()) {
            Text("Missing assets", style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(report.missing, key = { it.id }) {
                    Text("• ${it.assetNumber} — ${it.name}",
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet)) {
            Text("Back to audits")
        }
    }
}
