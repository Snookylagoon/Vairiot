package com.vairiot.app.data.api

data class LoginRequest(
    val email:    String,
    val password: String,
    val tenantId: String,
)

data class LoginResponse(
    val accessToken:  String,
    val refreshToken: String,
    val expiresIn:    String,
)

data class UserProfileResponse(
    val userId:   String,
    val email:    String,
    val tenantId: String,
    val roles:    List<String>,
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
    val id:          String,
    val name:        String,
    val status:      String,
    val siteId:      String?,
    val locationId:  String?,
    val scheduledAt: String?,
    val startedAt:   String?,
    val completedAt: String?,
    val createdAt:   String,
    val _count:      AuditCountResponse? = null,
)

data class AuditCountResponse(val scanEvents: Int)

data class RecordScanRequest(
    val tagValue: String,
    val deviceId: String? = null,
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
