package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AuditListScreen(
    onCampaignClick: (campaignId: String, status: String) -> Unit,
    viewModel: AuditListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

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
                Text("Audit campaigns", style = MaterialTheme.typography.bodySmall,
                    color = White.copy(alpha = 0.6f))
            }
        }

        when {
            state.isLoading -> Row(modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(color = VairiotViolet,
                    modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Text("Loading…", style = MaterialTheme.typography.bodyMedium)
            }
            state.error != null -> Text(state.error!!,
                modifier = Modifier.padding(16.dp), color = ErrorRed)
            state.campaigns.isEmpty() -> Text("No audit campaigns yet.",
                modifier = Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.campaigns, key = { it.id }) { c ->
                AuditRow(campaign = c, onClick = { onCampaignClick(c.id, c.status) })
            }
        }
    }
}

@Composable
private fun AuditRow(campaign: AuditCampaignResponse, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(10.dp)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text(campaign.name, style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                AuditStatusBadge(campaign.status)
            }
            Text("${campaign._count?.scanEvents ?: 0} scan${if ((campaign._count?.scanEvents ?: 0) == 1) "" else "s"} recorded",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun AuditStatusBadge(status: String) {
    val (bg, fg) = when (status.lowercase()) {
        "draft"       -> VairiotViolet.copy(alpha = 0.15f) to VairiotViolet
        "in_progress" -> WarningAmber.copy(alpha = 0.15f)  to WarningAmber
        "completed"   -> SuccessGreen.copy(alpha = 0.15f)  to SuccessGreen
        else          -> VairiotMauve.copy(alpha = 0.15f)  to VairiotMauve
    }
    Surface(color = bg, shape = RoundedCornerShape(6.dp)) {
        Text(status.replace('_', ' ').uppercase(),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fg, fontWeight = FontWeight.SemiBold)
    }
}
