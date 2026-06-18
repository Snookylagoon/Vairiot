package com.vairiot.app.di

import com.vairiot.app.scanner.MeferiScannerService
import com.vairiot.app.scanner.ScannerService
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ScannerModule {

    @Binds
    @Singleton
    abstract fun bindScannerService(impl: MeferiScannerService): ScannerService
}
