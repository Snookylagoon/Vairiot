package com.vairiot.app.di

import com.vairiot.app.location.DevicePositionProvider
import com.vairiot.app.location.PositionProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class LocationModule {
    @Binds
    abstract fun bindPositionProvider(impl: DevicePositionProvider): PositionProvider
}
