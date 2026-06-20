package com.vairiot.app.di

import android.os.Build
import com.vairiot.app.scanner.MeferiScannerService
import com.vairiot.app.scanner.NordicIdScannerService
import com.vairiot.app.scanner.ScannerService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Provider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ScannerModule {

    @Provides
    @Singleton
    fun provideScannerService(
        nordicId: Provider<NordicIdScannerService>,
        meferi: Provider<MeferiScannerService>,
    ): ScannerService {
        return when {
            Build.MANUFACTURER.contains("Nordic", ignoreCase = true) ||
            Build.MODEL.contains("HH8", ignoreCase = true)          -> nordicId.get()
            else                                                     -> meferi.get()
        }
    }
}
