package com.vairiot.app

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.scanner.ScannerService
import com.vairiot.app.ui.screens.*
import com.vairiot.app.ui.theme.VairiotTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

private data class HomeTab(val route: String, val label: String, val icon: ImageVector)
private val HOME_TABS = listOf(
    HomeTab("scan",   "Scan",   Icons.Default.QrCodeScanner),
    HomeTab("assets", "Assets", Icons.AutoMirrored.Filled.List),
    HomeTab("audits", "Audits", Icons.Default.FactCheck),
)

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var tokenStore: TokenStore
    @Inject lateinit var scanner: ScannerService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val hasToken = runBlocking { tokenStore.getAccessToken() != null }

        setContent {
            VairiotTheme {
                val rootNav = rememberNavController()
                val startDest = if (hasToken) "home" else "login"

                NavHost(navController = rootNav, startDestination = startDest) {
                    composable("login") {
                        LoginScreen(
                            onLoginSuccess = {
                                rootNav.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            }
                        )
                    }
                    composable("home")                        { HomeScaffold(rootNav = rootNav) }
                    composable("asset/{assetId}")             { AssetDetailScreen(onBack = { rootNav.popBackStack() }) }
                    composable("audit/{campaignId}/run")      { AuditRunScreen(onBack    = { rootNav.popBackStack() }) }
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode in HARDWARE_SCAN_KEYS && event?.repeatCount == 0) {
            scanner.startScan(); return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        private val HARDWARE_SCAN_KEYS = setOf(
            KeyEvent.KEYCODE_F1, KeyEvent.KEYCODE_F2,
            KeyEvent.KEYCODE_FOCUS, KeyEvent.KEYCODE_CAMERA,
            KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2,
        )
    }
}

@Composable
private fun HomeScaffold(rootNav: androidx.navigation.NavHostController) {
    val tabNav = rememberNavController()
    val current by tabNav.currentBackStackEntryAsState()
    val currentRoute = current?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                HOME_TABS.forEach { tab ->
                    NavigationBarItem(
                        icon  = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                        selected = current?.destination?.hierarchy?.any { it.route == tab.route } == true,
                        onClick = {
                            tabNav.navigate(tab.route) {
                                popUpTo(tabNav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        }
    ) { padding ->
        NavHost(navController = tabNav, startDestination = "scan",
            modifier = Modifier.padding(padding)) {
            composable("scan")   { AssetScanScreen() }
            composable("assets") {
                AssetListScreen(onAssetClick = { id -> rootNav.navigate("asset/$id") })
            }
            composable("audits") {
                AuditListScreen(onCampaignClick = { id, status ->
                    if (status == "in_progress" || status == "draft") {
                        rootNav.navigate("audit/$id/run")
                    } else {
                        rootNav.navigate("audit/$id/run") // report mode rendered if completed
                    }
                })
            }
        }
    }
}
