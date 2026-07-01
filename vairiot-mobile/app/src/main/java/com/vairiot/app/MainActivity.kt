package com.vairiot.app

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Build
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.vairiot.app.data.api.DeviceHeartbeatRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.DeviceInfoProvider
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.scanner.ScannerService
import com.vairiot.app.ui.screens.*
import com.vairiot.app.ui.theme.MontserratFamily
import com.vairiot.app.ui.theme.VairiotCharcoal
import com.vairiot.app.ui.theme.VairiotPink
import com.vairiot.app.ui.theme.VairiotTheme
import com.vairiot.app.ui.theme.VairiotViolet
import com.vairiot.app.ui.theme.White
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

val LocalUseSideRail = compositionLocalOf { false }

private data class HomeTab(val route: String, val label: String, val icon: ImageVector)
private val HOME_TABS = listOf(
    HomeTab("scan",        "Scan",        Icons.Default.QrCodeScanner),
    HomeTab("assets",      "Assets",      Icons.AutoMirrored.Filled.List),
    HomeTab("maintenance", "Maint.",      Icons.Default.Build),
    HomeTab("audits",      "Audits",      Icons.Default.FactCheck),
    HomeTab("profile",     "Profile",     Icons.Default.AccountCircle),
)

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var tokenStore: TokenStore
    @Inject lateinit var scanner: ScannerService
    @Inject lateinit var api: VairiotApiService
    @Inject lateinit var deviceInfo: DeviceInfoProvider

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        startDeviceHeartbeat()

        val hasToken = runBlocking { tokenStore.getAccessToken() != null }

        setContent {
            VairiotTheme {
                val defaultViewConfig = LocalViewConfiguration.current
                val lowSlopConfig = remember(defaultViewConfig) {
                    object : ViewConfiguration by defaultViewConfig {
                        override val touchSlop: Float
                            get() = defaultViewConfig.touchSlop * 0.5f
                    }
                }
                CompositionLocalProvider(LocalViewConfiguration provides lowSlopConfig) {
                MandatoryUpdateGate {
                val rootNav = rememberNavController()
                val startDest = if (hasToken) "home" else "login"

                NavHost(navController = rootNav, startDestination = startDest) {
                    composable("login") {
                        LoginScreen(
                            onLoginSuccess = {
                                rootNav.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            },
                            onTwoFactorSetup = { setupToken, tenantId ->
                                val encoded = android.net.Uri.encode(setupToken)
                                rootNav.navigate("2fa-setup/$encoded/$tenantId")
                            },
                            onTwoFactorVerify = { challengeToken, tenantId ->
                                val encoded = android.net.Uri.encode(challengeToken)
                                rootNav.navigate("2fa-verify/$encoded/$tenantId")
                            },
                            onPasswordChange = { challengeToken, currentPassword, tenantId ->
                                val encToken = android.net.Uri.encode(challengeToken)
                                val encPw    = android.net.Uri.encode(currentPassword)
                                rootNav.navigate("password-change/$encToken/$encPw/$tenantId")
                            },
                        )
                    }
                    composable("2fa-setup/{setupToken}/{tenantId}") {
                        val setupToken = android.net.Uri.decode(
                            it.arguments?.getString("setupToken").orEmpty())
                        val tenantId   = it.arguments?.getString("tenantId").orEmpty()
                        TwoFactorSetupScreen(
                            setupToken = setupToken,
                            tenantId   = tenantId,
                            onComplete = {
                                rootNav.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            },
                            onCancel = { rootNav.popBackStack() },
                        )
                    }
                    composable("2fa-verify/{challengeToken}/{tenantId}") {
                        val challengeToken = android.net.Uri.decode(
                            it.arguments?.getString("challengeToken").orEmpty())
                        val tenantId = it.arguments?.getString("tenantId").orEmpty()
                        TwoFactorVerifyScreen(
                            challengeToken = challengeToken,
                            tenantId       = tenantId,
                            onSuccess = {
                                rootNav.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            },
                            onCancel = { rootNav.popBackStack() },
                        )
                    }
                    composable("password-change/{challengeToken}/{currentPassword}/{tenantId}") {
                        val challengeToken  = android.net.Uri.decode(
                            it.arguments?.getString("challengeToken").orEmpty())
                        val currentPassword = android.net.Uri.decode(
                            it.arguments?.getString("currentPassword").orEmpty())
                        val tenantId        = it.arguments?.getString("tenantId").orEmpty()
                        ForcedPasswordChangeScreen(
                            challengeToken  = challengeToken,
                            currentPassword = currentPassword,
                            tenantId        = tenantId,
                            onSuccess = {
                                rootNav.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            },
                            onTwoFactorVerify = { token, tenant ->
                                val encoded = android.net.Uri.encode(token)
                                rootNav.navigate("2fa-verify/$encoded/$tenant") {
                                    popUpTo("login")
                                }
                            },
                            onTwoFactorSetup = { token, tenant ->
                                val encoded = android.net.Uri.encode(token)
                                rootNav.navigate("2fa-setup/$encoded/$tenant") {
                                    popUpTo("login")
                                }
                            },
                            onCancel = { rootNav.popBackStack() },
                        )
                    }
                    composable("home")                        { HomeScaffold(rootNav = rootNav) }
                    composable("asset/{assetId}")             {
                        val backStackEntry = it
                        val assetId = backStackEntry.arguments?.getString("assetId").orEmpty()
                        AssetDetailScreen(
                            onBack = { rootNav.popBackStack() },
                            onEdit = { rootNav.navigate("asset/$assetId/edit") },
                            onLabel = { rootNav.navigate("asset/$assetId/label") },
                        )
                    }
                    composable("asset/{assetId}/edit")        {
                        AssetEditScreen(
                            onBack  = { rootNav.popBackStack() },
                            onSaved = { rootNav.popBackStack() },
                        )
                    }
                    composable("asset/{assetId}/label")       {
                        val assetId = it.arguments?.getString("assetId").orEmpty()
                        LabelDesignScreen(
                            onBack = { rootNav.popBackStack() },
                            onPrinterSetup = { rootNav.navigate("asset/$assetId/printer-setup") },
                        )
                    }
                    composable("asset/{assetId}/printer-setup") {
                        PrinterSetupScreen(
                            onBack = { rootNav.popBackStack() },
                        )
                    }
                    composable("audit/{campaignId}/run")      { AuditRunScreen(onBack    = { rootNav.popBackStack() }) }
                    composable("scan-session/setup")          {
                        ScanSessionSetupScreen(
                            onBack  = { rootNav.popBackStack() },
                            onStart = { sessionId ->
                                rootNav.navigate("scan-session/$sessionId") {
                                    popUpTo("scan-session/setup") { inclusive = true }
                                }
                            },
                        )
                    }
                    composable("scan-session/{sessionId}")    {
                        val sessionId = it.arguments?.getString("sessionId").orEmpty()
                        ScanSessionScreen(
                            onBack     = { rootNav.popBackStack() },
                            onComplete = { finishedId ->
                                rootNav.navigate("scan-session/$finishedId/complete") {
                                    popUpTo("scan-session/$sessionId") { inclusive = true }
                                }
                            },
                            onAssetClick = { assetId -> rootNav.navigate("asset/$assetId") },
                        )
                    }
                    composable("scan-session/{sessionId}/complete") {
                        ScanSessionCompleteScreen(
                            onDone = {
                                rootNav.navigate("home") { popUpTo("home") { inclusive = false } }
                            },
                        )
                    }
                    composable("maintenance/{eventId}")       { MaintenanceDetailScreen(onBack = { rootNav.popBackStack() }) }
                }
                } // MandatoryUpdateGate
                } // CompositionLocalProvider
            }
        }
    }

    /**
     * Pings the licence heartbeat endpoint every 60s while the app is in the
     * foreground and a session token exists, so the device shows as
     * "connected now" in the licensing panel. Runs only between onStart/onStop.
     */
    private fun startDeviceHeartbeat() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                val fingerprint = deviceInfo.fingerprint()
                while (true) {
                    if (tokenStore.getAccessToken() != null) {
                        try {
                            api.sendDeviceHeartbeat(DeviceHeartbeatRequest(fingerprint))
                        } catch (_: Exception) {
                            // Best-effort — a missed ping just shows the device offline.
                        }
                    }
                    delay(HEARTBEAT_INTERVAL_MS)
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
        private const val HEARTBEAT_INTERVAL_MS = 60_000L
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
    val config = LocalConfiguration.current
    val useSideRail = config.screenWidthDp > config.screenHeightDp && config.screenWidthDp >= 600

    val navigateToTab: (String) -> Unit = { route ->
        tabNav.navigate(route) {
            popUpTo(tabNav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    val tabContent: @Composable (Modifier) -> Unit = { modifier ->
        NavHost(navController = tabNav, startDestination = "scan", modifier = modifier) {
            composable("scan")   {
                AssetScanScreen(
                    onStartSession = { rootNav.navigate("scan-session/setup") },
                )
            }
            composable("assets") {
                AssetListScreen(onAssetClick = { id -> rootNav.navigate("asset/$id") })
            }
            composable("maintenance") {
                MaintenanceListScreen(onEventClick = { id -> rootNav.navigate("maintenance/$id") })
            }
            composable("audits") {
                AuditListScreen(onCampaignClick = { id, status ->
                    if (status == "in_progress" || status == "draft") {
                        rootNav.navigate("audit/$id/run")
                    } else {
                        rootNav.navigate("audit/$id/run")
                    }
                })
            }
            composable("profile") {
                val scope = rememberCoroutineScope()
                val activity = androidx.compose.ui.platform.LocalContext.current as? MainActivity
                ProfileScreen(onLogout = {
                    scope.launch {
                        activity?.tokenStore?.clear()
                        rootNav.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                })
            }
        }
    }

    if (useSideRail) {
        CompositionLocalProvider(LocalUseSideRail provides true) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Full-width header
                Box(
                    modifier = Modifier.fillMaxWidth()
                        .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.height(28.dp).width(4.dp)
                            .background(Brush.verticalGradient(listOf(VairiotPink, VairiotViolet)),
                                RoundedCornerShape(2.dp)))
                        Spacer(Modifier.width(12.dp))
                        Text("VAIRIOT", style = MaterialTheme.typography.titleLarge,
                            fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                            color = White)
                    }
                }
                // Rail + content
                Row(modifier = Modifier.weight(1f)) {
                    NavigationRail(modifier = Modifier.fillMaxHeight()) {
                        HOME_TABS.forEach { tab ->
                            NavigationRailItem(
                                icon     = { Icon(tab.icon, contentDescription = tab.label) },
                                label    = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                                selected = current?.destination?.hierarchy?.any { it.route == tab.route } == true,
                                onClick  = { navigateToTab(tab.route) },
                            )
                        }
                    }
                    tabContent(Modifier.weight(1f))
                }
            }
        }
    } else {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    HOME_TABS.forEach { tab ->
                        NavigationBarItem(
                            icon  = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                            selected = current?.destination?.hierarchy?.any { it.route == tab.route } == true,
                            onClick = { navigateToTab(tab.route) },
                        )
                    }
                }
            }
        ) { padding ->
            tabContent(Modifier.padding(padding))
        }
    }
}
