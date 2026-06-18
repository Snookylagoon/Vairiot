package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AssetDetailScreen(
    onBack: () -> Unit,
    onEdit: () -> Unit = {},
    viewModel: AssetDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(
            modifier = Modifier.fillMaxWidth()
                .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back", tint = White)
                }
                Text("Asset", style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                    color = White)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit", tint = White)
                }
            }
        }

        when (val s = state) {
            is AssetDetailUiState.Loading -> LoadingCard()
            is AssetDetailUiState.Error   -> ErrorCard(s.message, onReset = onBack)
            is AssetDetailUiState.Loaded  -> AssetBody(s.asset)
        }
    }
}

@Composable
private fun AssetBody(asset: AssetResponse) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

        Card(modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(asset.assetNumber, style = MaterialTheme.typography.labelMedium,
                    color = VairiotViolet, fontWeight = FontWeight.SemiBold)
                Text(asset.name, style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, color = VairiotCharcoal)
                asset.description?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DetailRow("Status",      asset.status.uppercase())
                DetailRow("Condition",   asset.condition)
                asset.category?.let { DetailRow("Category", it.name) }
                asset.site?.let      { DetailRow("Site",     it.name) }
                asset.location?.let  { DetailRow("Location", it.name) }
                asset.serialNumber?.let { DetailRow("Serial number", it) }
                asset.barcode?.let      { DetailRow("Barcode", it) }
                asset.rfidTag?.let      { DetailRow("RFID tag", it) }
            }
        }

        AssetPhotosSection()
    }
}
