package com.vairiot.app.data.api

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface VairiotApiService {

    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("api/v1/auth/refresh")
    suspend fun refreshTokens(@Body request: RefreshRequest): RefreshResponse

    @GET("api/v1/auth/me")
    suspend fun getMe(): UserProfileResponse

    @GET("api/v1/assets")
    suspend fun listAssets(
        @Query("search")    search:    String? = null,
        @Query("status")    status:    String? = null,
        @Query("condition") condition: String? = null,
        @Query("sortBy")    sortBy:    String? = null,
        @Query("sortOrder") sortOrder: String? = null,
        @Query("page")      page:      Int     = 1,
        @Query("pageSize")  pageSize:  Int     = 25,
    ): AssetListResponse

    @GET("api/v1/assets/{id}")
    suspend fun getAsset(@Path("id") id: String): AssetResponse

    @GET("api/v1/assets/tag/{tag}")
    suspend fun getAssetByTag(@Path("tag") tag: String): AssetResponse

    // ─── Audits ────────────────────────────────────────────────────────────
    @GET("api/v1/audits")
    suspend fun listAudits(): List<AuditCampaignResponse>

    @POST("api/v1/audits/{id}/start")
    suspend fun startAudit(@Path("id") id: String): AuditCampaignResponse

    @POST("api/v1/audits/{id}/scans")
    suspend fun recordAuditScan(
        @Path("id") id: String,
        @Body request: RecordScanRequest,
    ): AuditScanEventResponse

    @POST("api/v1/audits/{id}/complete")
    suspend fun completeAudit(@Path("id") id: String): AuditReportResponse

    @GET("api/v1/audits/{id}/report")
    suspend fun getAuditReport(@Path("id") id: String): AuditReportResponse

    // ─── Asset update ──────────────────────────────────────────────────────
    @PATCH("api/v1/assets/{id}")
    suspend fun updateAsset(
        @Path("id") id: String,
        @Body update: AssetUpdateRequest,
    ): AssetResponse

    // ─── Photos ────────────────────────────────────────────────────────────
    @GET("api/v1/assets/{id}/photos")
    suspend fun listAssetPhotos(@Path("id") id: String): List<PhotoResponse>

    @Multipart
    @POST("api/v1/assets/{id}/photos")
    suspend fun uploadAssetPhoto(
        @Path("id") id: String,
        @Part photo: MultipartBody.Part,
    ): PhotoResponse

    @Streaming
    @GET("api/v1/photos/{id}/download")
    suspend fun downloadPhoto(@Path("id") id: String): ResponseBody

    @PATCH("api/v1/photos/{id}")
    suspend fun updatePhoto(
        @Path("id") id: String,
        @Body update: PhotoUpdateRequest,
    ): PhotoResponse

    @DELETE("api/v1/photos/{id}")
    suspend fun deletePhoto(@Path("id") id: String): Map<String, String>

    // ─── Maintenance ───────────────────────────────────────────────────────
    @POST("api/v1/maintenance")
    suspend fun createMaintenanceEvent(
        @Body request: MaintenanceCreateRequest,
    ): MaintenanceEventResponse
}
