package com.vairiot.app.domain.model

data class AuthTokens(
    val accessToken:  String,
    val refreshToken: String,
    val expiresIn:    String,
)

data class UserProfile(
    val userId:   String,
    val email:    String,
    val tenantId: String,
    val roles:    List<String>,
)

data class Asset(
    val id:           String,
    val assetNumber:  String,
    val name:         String,
    val description:  String?,
    val status:       String,
    val condition:    String,
    val serialNumber: String?,
    val barcode:      String?,
    val rfidTag:      String?,
    val category:     CategoryRef?,
    val site:         SiteRef?,
    val location:     LocationRef?,
)

data class CategoryRef(val id: String, val name: String)
data class SiteRef(val id: String, val name: String)
data class LocationRef(val id: String, val name: String)

data class AssetListResponse(
    val assets:     List<Asset>,
    val total:      Int,
    val page:       Int,
    val pageSize:   Int,
    val totalPages: Int,
)
