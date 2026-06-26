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

    @POST("api/v1/auth/login/2fa")
    suspend fun loginWithTwoFactor(@Body request: TwoFactorLoginRequest): LoginResponse

    @POST("api/v1/auth/change-password/forced")
    suspend fun completeForcedPasswordChange(@Body request: ForcedPasswordChangeRequest): LoginResponse

    @POST("api/v1/auth/2fa-setup/generate")
    suspend fun generateTwoFactorSetup(@Body request: TwoFactorSetupGenerateRequest): TwoFactorSetupResponse

    @POST("api/v1/auth/2fa-setup/verify")
    suspend fun verifyTwoFactorSetup(@Body request: TwoFactorSetupVerifyRequest): LoginResponse

    @GET("api/v1/auth/me")
    suspend fun getMe(): UserProfileResponse

    @GET("api/v1/licences/status")
    suspend fun getLicenceStatus(): LicenceStatusResponse

    @POST("api/v1/licences/devices/heartbeat")
    suspend fun sendDeviceHeartbeat(@Body request: DeviceHeartbeatRequest): DeviceHeartbeatResponse

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

    // ─── Sites / Locations / Categories (for scope pickers) ────────────────
    @GET("api/v1/sites")
    suspend fun listSites(): List<SiteRefResponse>

    @GET("api/v1/sites/{siteId}/locations")
    suspend fun listSiteLocations(@Path("siteId") siteId: String): List<LocationRefResponse>

    @GET("api/v1/categories")
    suspend fun listCategories(): List<CategoryRefResponse>

    // ─── Audits ────────────────────────────────────────────────────────────
    @GET("api/v1/audits")
    suspend fun listAudits(): List<AuditCampaignResponse>

    @POST("api/v1/audits")
    suspend fun createAudit(@Body request: CreateAuditRequest): AuditCampaignResponse

    @POST("api/v1/audits/{id}/start")
    suspend fun startAudit(@Path("id") id: String): AuditCampaignResponse

    @POST("api/v1/audits/{id}/scans")
    suspend fun recordAuditScan(
        @Path("id") id: String,
        @Body request: RecordScanRequest,
    ): AuditScanEventResponse

    @POST("api/v1/audits/{id}/zones/{locationId}/submit")
    suspend fun submitAuditZone(
        @Path("id") id: String,
        @Path("locationId") locationId: String,
    ): ZoneSubmissionResponse

    @GET("api/v1/audits/{id}/zones")
    suspend fun listAuditZones(@Path("id") id: String): List<ZoneSubmissionResponse>

    @POST("api/v1/audits/{id}/complete")
    suspend fun completeAudit(@Path("id") id: String): AuditReportResponse

    @GET("api/v1/audits/{id}/report")
    suspend fun getAuditReport(@Path("id") id: String): AuditReportResponse

    // ─── Asset create ─────────────────────────────────────────────────────
    @POST("api/v1/assets")
    suspend fun createAsset(@Body request: AssetCreateRequest): AssetResponse

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
        @Part thumb: MultipartBody.Part? = null,
    ): PhotoResponse

    @Streaming
    @GET("api/v1/photos/{id}/download")
    suspend fun downloadPhoto(
        @Path("id") id: String,
        @Query("thumb") thumbFlag: String? = null,
    ): ResponseBody

    @PATCH("api/v1/photos/{id}")
    suspend fun updatePhoto(
        @Path("id") id: String,
        @Body update: PhotoUpdateRequest,
    ): PhotoResponse

    @DELETE("api/v1/photos/{id}")
    suspend fun deletePhoto(@Path("id") id: String): Map<String, String>

    // ─── Maintenance ───────────────────────────────────────────────────────
    @GET("api/v1/maintenance")
    suspend fun listMaintenanceEvents(
        @Query("status")    status:    String? = null,
        @Query("search")    search:    String? = null,
        @Query("sortBy")    sortBy:    String? = null,
        @Query("sortOrder") sortOrder: String? = null,
        @Query("page")      page:      Int     = 1,
        @Query("pageSize")  pageSize:  Int     = 25,
    ): MaintenanceListResponse

    @GET("api/v1/maintenance/{id}")
    suspend fun getMaintenanceEvent(@Path("id") id: String): MaintenanceEventResponse

    @POST("api/v1/maintenance")
    suspend fun createMaintenanceEvent(
        @Body request: MaintenanceCreateRequest,
    ): MaintenanceEventResponse

    @PATCH("api/v1/maintenance/{id}")
    suspend fun updateMaintenanceEvent(
        @Path("id") id: String,
        @Body update: MaintenanceUpdateRequest,
    ): MaintenanceEventResponse

    @GET("api/v1/maintenance/{id}/photos")
    suspend fun listMaintenancePhotos(@Path("id") id: String): List<PhotoResponse>

    @Multipart
    @POST("api/v1/maintenance/{id}/photos")
    suspend fun uploadMaintenancePhoto(
        @Path("id") id: String,
        @Part photo: MultipartBody.Part,
        @Part thumb: MultipartBody.Part? = null,
    ): PhotoResponse
}
