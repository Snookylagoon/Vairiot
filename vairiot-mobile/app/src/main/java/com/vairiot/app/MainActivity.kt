package com.vairiot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.ui.screens.AssetScanScreen
import com.vairiot.app.ui.screens.LoginScreen
import com.vairiot.app.ui.theme.VairiotTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var tokenStore: TokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Check if already logged in
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
}
