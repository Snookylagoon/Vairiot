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
