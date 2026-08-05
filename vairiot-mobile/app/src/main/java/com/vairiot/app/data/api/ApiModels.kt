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

data class DeviceHeartbeatRequest(
    val fingerprint: String,
)

data class DeviceHeartbeatResponse(
    val online: Boolean = false,
    val active: Boolean = false,
)

// The API returns ONE of four shapes for /auth/login:
//   1. {accessToken, refreshToken, expiresIn}                                     — normal
//   2. {requiresTwoFactor, twoFactorChallengeToken}                               — TOTP challenge
//   3. {requiresTwoFactorSetup, twoFactorSetupToken}                              — first-time enrol
//   4. {requiresPasswordChange, passwordChangeToken}                              — forced pw change
// All fields are nullable so Gson can deserialise whichever shape comes back.
data class LoginResponse(
    val accessToken:              String? = null,
    val refreshToken:             String? = null,
    val expiresIn:                String? = null,
    val requiresTwoFactor:        Boolean? = null,
    val twoFactorChallengeToken:  String? = null,
    val requiresTwoFactorSetup:   Boolean? = null,
    val twoFactorSetupToken:      String? = null,
    val requiresPasswordChange:   Boolean? = null,
    val passwordChangeToken:      String? = null,
)

data class TwoFactorLoginRequest(
    val challengeToken: String,
    val token:          String,
    val device:         DeviceCheckIn? = null,
)

data class TwoFactorSetupGenerateRequest(
    val setupToken: String,
)

data class TwoFactorSetupResponse(
    val secret:      String,
    val otpauthUrl:  String,
    val backupCodes: List<String>,
)

data class TwoFactorSetupVerifyRequest(
    val setupToken: String,
    val token:      String,
    val device:     DeviceCheckIn? = null,
)

data class UserProfileResponse(
    val userId:       String,
    val email:        String,
    val tenantId:     String,
    val tenantName:   String? = null,
    val roles:        List<String>,
    val permissions:  List<String> = emptyList(),
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

data class ForcedPasswordChangeRequest(
    val challengeToken:  String,
    val currentPassword: String,
    val newPassword:     String,
    val device:          DeviceCheckIn? = null,
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
    // GS1 identity — allocated by the server, never authored by the app
    val individualAssetReference: String? = null,
    val allocationAuthority:      String? = null,
    val giai:                     String? = null,
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
    /** Idempotency key so offline replays can't double-count. */
    val clientRequestId: String? = null,
    /** ISO-8601 device capture time for offline scans replayed later. */
    val capturedAt: String? = null,
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
    val vendor:          String? = null,
    val workOrderNumber: String? = null,
    val cost:            String? = null,
    val description:     String? = null,
    val notes:           String? = null,
    val scheduledDate:   String? = null,
    val completedDate:   String? = null,
    val status:          String,
    val createdBy:       String? = null,
    val createdAt:       String,
    val updatedAt:       String? = null,
    val asset:           MaintenanceAssetRef? = null,
)

data class MaintenanceAssetRef(
    val id:          String,
    val assetNumber: String,
    val name:        String,
)

data class MaintenanceListResponse(
    val events:     List<MaintenanceEventResponse>,
    val total:      Int,
    val page:       Int,
    val pageSize:   Int,
    val totalPages: Int,
)

data class MaintenanceUpdateRequest(
    val status:        String? = null,
    val notes:         String? = null,
    val completedDate: String? = null,
)

// ─── Scan sessions ────────────────────────────────────────────────────────
data class ScanSessionTagDto(
    val epc:            String,
    val status:         String,
    val readCount:      Int,
    val firstSeenMs:    Long,
    val lastSeenMs:     Long,
    val assetId:        String? = null,
)

data class ScanSessionUploadRequest(
    val sessionId:      String,
    val siteId:         String? = null,
    val categoryId:     String? = null,
    val createdAtMs:    Long,
    val completedAtMs:  Long,
    val tags:           List<ScanSessionTagDto>,
)

data class ScanSessionUploadResponse(
    val id:         String,
    val uploadedAt: String,
)

// ─── Company ──────────────────────────────────────────────────────────────
data class CompanyResponse(
    val id:                  String,
    val legalName:           String? = null,
    val tradingName:         String? = null,
    val addressLine1:        String? = null,
    val addressLine2:        String? = null,
    val city:                String? = null,
    val stateProvince:       String? = null,
    val postalCode:          String? = null,
    val country:             String? = null,
    val primaryContactEmail: String? = null,
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
    /** Idempotency key so offline replays can't create duplicate assets. */
    val clientRequestId: String? = null,
)

// ─── GS1 identification ────────────────────────────────────────────────────
data class Gs1PrefixResponse(
    val id:     String,
    val prefix: String,
    val status: String,
)

data class IdentificationResponse(
    val slug:            String,
    val mode:            String? = null,          // "INTERNAL" | "GS1"
    val tenantMark:      String? = null,
    val digitalLinkHost: String? = null,
    val activePrefix:    Gs1PrefixResponse? = null,
)

data class Gs1EncodingResponse(
    val mode:          String,
    val scheme:        String? = null,
    val epcHex:        String? = null,
    val giai:          String? = null,
    val hri:           String,
    val elementString: String,
    val digitalLink:   String,
)

data class AssetGs1Response(
    val encoding: Gs1EncodingResponse? = null,
)

/**
 * GET /assets/by-epc/{epcHex}. kind is ASSET (bound tag, asset present),
 * UNBOUND_TAG (commissioned but not bound) or FOREIGN_TAG (another tenant's
 * ACTIVE GS1 prefix — companyPrefix identifies the owner). 404 otherwise.
 */
data class AssetByEpcResponse(
    val kind:          String,
    val asset:         AssetResponse? = null,
    val scheme:        String? = null,
    val companyPrefix: String? = null,
)

// ─── GS1 tag commissioning ─────────────────────────────────────────────────
data class CommissionTagRequest(
    val assetId:  String,
    val tidHex:   String,
    val deviceId: String? = null,
)

data class TagWritePlanResponse(
    val permalockAllowed:       Boolean = false,
    val permalockBlockedReason: String? = null,
)

data class CommissionTagResponse(
    val tagId:     String,
    val epcHex:    String,
    val epcScheme: String,
    val writePlan: TagWritePlanResponse? = null,
)

data class VerifyTagRequest(
    val assetId:       String,
    val readEpcHex:    String,
    val readTidHex:    String,
    val writeAttempts: Int?    = null,
    val deviceId:      String? = null,
)

data class LabelPrintRequest(
    val assetIds:     List<String>,
    val templateCode: String,
    val symbology:    String? = null,   // QR | GS1_128 | DATAMATRIX
    val deviceId:     String? = null,
    val printerId:    String? = null,
)

// ─── Label templates ───────────────────────────────────────────────────────
// Designed in the web app; config is written by the desktop designer so every
// field is nullable — older or partially saved templates may omit any of them.
data class LabelTemplateDto(
    val id:     String,
    val name:   String,
    val config: LabelTemplateConfigDto? = null,
)

data class LabelTemplateConfigDto(
    val barcodeType:   String?  = null,   // 'qrcode' | 'datamatrix' | 'code128' | …
    val sizePreset:    String?  = null,   // 'avery-5167' … | 'custom'
    val customW:       Double?  = null,   // mm, when sizePreset == 'custom'
    val customH:       Double?  = null,
    val fields:        LabelTemplateFieldsDto? = null,
    val barcodeMm:     Double?  = null,   // fixed 2D symbol size in mm; null → automatic
    val layout:        Map<String, LabelLayoutPosDto>? = null, // freeform positions; null → automatic
    val styles:        Map<String, LabelTextStyleDto>? = null, // per-field bold/italic/font overrides
    val printMode:     String?  = null,   // 'sheet' | 'roll' — browser-driver concern
    val printRotation: Int?     = null,   // 0 | 90 | 180 | 270
    val printRotate:   Boolean? = null,   // legacy — true ≙ 90
    val monochrome:    Boolean? = null,
    val printer:       PrinterSettingsDto? = null,
)

/** Fractional top-left position (0–1 of label width/height) — web layout editor. */
data class LabelLayoutPosDto(val x: Double? = null, val y: Double? = null)

data class LabelTextStyleDto(
    val bold:   Boolean? = null,
    val italic: Boolean? = null,
    val font:   Double?  = null,  // px at 1× (96 dpi label space)
)

data class LabelTemplateFieldsDto(
    val name:           Boolean? = null,
    val assetNumber:    Boolean? = null,
    val serialNumber:   Boolean? = null,
    val barcode:        Boolean? = null,
    val site:           Boolean? = null,
    val category:       Boolean? = null,
    val companyName:    Boolean? = null,
    val companyAddress: Boolean? = null,
    val companyEmail:   Boolean? = null,
    val companyLogo:    Boolean? = null,  // no logo rendering on mobile — ignored
)

data class PrinterSettingsDto(
    val name:   String? = null,   // printer these settings are tuned for
    val copies: Int?    = null,   // copies per label, 1–20
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
    val siteId:       String?  = null,
    val locationId:   String?  = null,
)
