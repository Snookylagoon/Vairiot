package com.vairiot.app

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.scanner.ScannerService
import com.vairiot.app.ui.screens.AssetScanScreen
import com.vairiot.app.ui.screens.LoginScreen
import com.vairiot.app.ui.theme.VairiotTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

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
                val navController = rememberNavController()
                val startDest = if (hasToken) "scan" else "login"

                NavHost(navController = navController, startDestination = startDest) {
                    composable("login") {
                        LoginScreen(
                            onLoginSuccess = {
                                navController.navigate("scan") {
                                    popUpTo("login") { inclusive = true }
                                }
                            }
                        )
                    }
                    composable("scan") {
                        AssetScanScreen()
                    }
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode in HARDWARE_SCAN_KEYS && event?.repeatCount == 0) {
            scanner.startScan()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        private val HARDWARE_SCAN_KEYS = setOf(
            KeyEvent.KEYCODE_F1,
            KeyEvent.KEYCODE_F2,
            KeyEvent.KEYCODE_FOCUS,
            KeyEvent.KEYCODE_CAMERA,
            KeyEvent.KEYCODE_BUTTON_L2,
            KeyEvent.KEYCODE_BUTTON_R2,
        )
    }
}
