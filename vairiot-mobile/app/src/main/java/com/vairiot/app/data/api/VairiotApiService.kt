package com.vairiot.app.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface VairiotApiService {

    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/v1/auth/me")
    suspend fun getMe(): UserProfileResponse

    @GET("api/v1/assets")
    suspend fun listAssets(
        @Query("search")   search:   String? = null,
        @Query("page")     page:     Int     = 1,
        @Query("pageSize") pageSize: Int     = 25,
    ): AssetListResponse

    @GET("api/v1/assets/{id}")
    suspend fun getAsset(@Path("id") id: String): AssetResponse

    @GET("api/v1/assets/tag/{tag}")
    suspend fun getAssetByTag(@Path("tag") tag: String): AssetResponse
}
