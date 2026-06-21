package com.vairiot.app.data.api

data class LoginRequest(
    val email:    String,
    val password: String,
    val tenantId: String,
    val device:   DeviceCheckIn? = null,
)

data class DeviceCheckIn(
    val fingerprint: String,
    val deviceName:  String,
    val deviceType:  String = "mobile",
)

data class LoginResponse(
    val accessToken:  String,
    val refreshToken: String,
    val expiresIn:    String,
)

data class UserProfileResponse(
    val userId:       String,
    val email:        String,
    val tenantId:     String,
    val tenantName:   String? = null,
    val roles:        List<String>,
    val featureFlags: Map<String, Boolean>? = null,
)

data class LicenceStatusResponse(
    val licenceId:        String,
    val licenceNumber:    String,
    val tierName:         String,
    val tierDisplayName:  String,
    val status:           String,
    val activatedAt:      String?,
    val expiresAt:        String?,
    val daysRemaining:    Int?,
    val paymentConfirmed: Boolean,
)

data class RefreshRequest(val refreshToken: String)

data class RefreshResponse(
    val accessToken:  String,
    val refreshToken: String,
    val expiresIn:    String,
)

data class AssetResponse(
    val id:           String,
    val assetNumber:  String,
    val name:         String,
    val description:  String?,
    val status:       String,
    val condition:    String,
    val serialNumber: String?,
    val barcode:      String?,
    val rfidTag:      String?,
    val category:     CategoryRefResponse?,
    val site:         SiteRefResponse?,
    val location:     LocationRefResponse?,
)

data class CategoryRefResponse(val id: String, val name: String)
data class SiteRefResponse(val id: String, val name: String)
data class LocationRefResponse(val id: String, val name: String)

data class AssetListResponse(
    val assets:     List<AssetResponse>,
    val total:      Int,
    val page:       Int,
    val pageSize:   Int,
    val totalPages: Int,
)

// ─── Audits ────────────────────────────────────────────────────────────────
data class AuditCampaignResponse(
    val id:               String,
    val name:             String,
    val mode:             String = "sighted",
    val status:           String,
    val siteId:           String?,
    val locationId:       String?,
    val linkedCampaignId: String? = null,
    val scheduledAt:      String?,
    val startedAt:        String?,
    val completedAt:      String?,
    val createdAt:        String,
    val _count:           AuditCountResponse? = null,
)

data class AuditCountResponse(val scanEvents: Int)

data class CreateAuditRequest(
    val name:       String,
    val mode:       String? = null,
    val siteId:     String? = null,
    val locationId: String? = null,
    val categoryId: String? = null,
    val assetIds:   List<String>? = null,
)

data class RecordScanRequest(
    val tagValue:   String,
    val deviceId:   String? = null,
    val locationId: String? = null,
    val condition:  String? = null,
)

data class ZoneSubmissionResponse(
    val id:          String,
    val campaignId:  String,
    val locationId:  String,
    val submittedBy: String,
    val submittedAt: String,
)

data class AuditScanEventResponse(
    val id:         String,
    val campaignId: String,
    val tagValue:   String,
    val assetId:    String?,
    val result:     String,
    val scannedAt:  String,
)

data class AuditReportResponse(
    val campaignId:    String,
    val totalScanned:  Int,
    val totalExpected: Int,
    val found:         Int,
    val missing:       List<MissingAssetResponse>,
    val unknownTags:   List<String>,
)

data class MissingAssetResponse(
    val id:          String,
    val assetNumber: String,
    val name:        String,
)

// ─── Photos ────────────────────────────────────────────────────────────────
data class PhotoResponse(
    val id:        String,
    val mimeType:  String,
    val sizeBytes: Int,
    val width:     Int? = null,
    val height:    Int? = null,
    val caption:   String? = null,
    val hasThumb:  Boolean = false,
    val createdAt: String,
    val createdBy: String? = null,
)

data class PhotoUpdateRequest(
    val caption: String?,
)

// ─── Maintenance ───────────────────────────────────────────────────────────
data class MaintenanceCreateRequest(
    val assetId:         String,
    val maintenanceType: String,
    val description:     String? = null,
    val notes:           String? = null,
    val status:          String? = null,
    val scheduledDate:   String? = null,
)

data class MaintenanceEventResponse(
    val id:              String,
    val assetId:         String,
    val maintenanceType: String,
    val workOrderNumber: String?,
    val description:     String?,
    val notes:           String?,
    val status:          String,
    val createdAt:       String,
)

// ─── Asset create ─────────────────────────────────────────────────────────
data class AssetCreateRequest(
    val name:         String,
    val rfidTag:      String?  = null,
    val barcode:      String?  = null,
    val description:  String?  = null,
    val serialNumber: String?  = null,
    val condition:    String   = "good",
    val status:       String   = "active",
    val categoryId:   String?  = null,
    val siteId:       String?  = null,
    val locationId:   String?  = null,
)

// ─── Asset update ──────────────────────────────────────────────────────────
data class AssetUpdateRequest(
    val name:         String?  = null,
    val description:  String?  = null,
    val status:       String?  = null,
    val condition:    String?  = null,
    val serialNumber: String?  = null,
    val barcode:      String?  = null,
    val rfidTag:      String?  = null,
    val notes:        String?  = null,
)
