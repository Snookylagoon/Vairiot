import java.util.Properties
import java.io.FileInputStream

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Release signing: reads ./keystore.properties (gitignored). If absent, release
// builds fall back to debug signing — fine for ad-hoc local builds, but every
// machine will produce a different signature, so OTA upgrades will be blocked.
// Run scripts/gen-release-keystore.sh once to generate a persistent keystore.
val keystorePropsFile = rootProject.file("app/keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(FileInputStream(keystorePropsFile))
}
val hasReleaseSigning = keystoreProps.getProperty("storeFile") != null

android {
    namespace = "com.vairiot.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vairiot.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Production API. For local dev on a USB device, swap to
        // "http://localhost:3001/" and run `adb reverse tcp:3001 tcp:3001`.
        // For the Android emulator, use "http://10.0.2.2:3001/".
        buildConfigField("String", "API_BASE_URL", "\"https://vai.vairiot.com/\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile     = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias      = keystoreProps.getProperty("keyAlias")
                keyPassword   = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose     = true
        buildConfig = true
    }
}

dependencies {
    // NordicID NUR SDK (local AAR/JAR from app/libs/)
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar", "*.aar"))))
    implementation("no.nordicsemi.android.support.v18:scanner:1.6.0")

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.material.icons.extended)
    implementation(libs.coil.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.hilt.work)
    implementation("com.google.zxing:core:3.5.3")
    ksp(libs.androidx.hilt.compiler)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
