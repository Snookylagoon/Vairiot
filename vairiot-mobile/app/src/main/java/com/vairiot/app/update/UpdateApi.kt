package com.vairiot.app.update

import com.google.gson.annotations.SerializedName
import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Streaming

data class MobileVersionResponse(
    val available: Boolean = false,
    val versionCode: Int? = null,
    val versionName: String? = null,
    val sha256: String? = null,
    val sizeBytes: Long? = null,
    val mandatory: Boolean = false,
    val releaseNotes: String? = null,
    @SerializedName("apkUrl") val apkUrl: String? = null,
)

interface UpdateApi {
    @GET("api/v1/mobile/version")
    suspend fun checkVersion(): MobileVersionResponse

    @Streaming
    @GET("api/v1/mobile/latest.apk")
    suspend fun downloadApk(): ResponseBody
}
