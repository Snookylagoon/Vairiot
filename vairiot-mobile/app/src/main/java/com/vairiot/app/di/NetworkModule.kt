package com.vairiot.app.di

import android.content.Context
import coil.ImageLoader
import com.google.gson.Gson
import com.vairiot.app.BuildConfig
import com.vairiot.app.data.api.RefreshRequest
import com.vairiot.app.data.api.RefreshResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.TokenStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(tokenStore: TokenStore): OkHttpClient {
        val authInterceptor = Interceptor { chain ->
            val token = runBlocking { tokenStore.getAccessToken() }
            val request = chain.request().newBuilder().apply {
                if (token != null) addHeader("Authorization", "Bearer $token")
            }.build()
            chain.proceed(request)
        }

        val tokenRefreshAuthenticator = object : Authenticator {
            override fun authenticate(route: Route?, response: Response): Request? {
                if (response.request.header("X-Retry") != null) return null
                val refreshToken = runBlocking { tokenStore.getRefreshToken() } ?: return null
                val json = Gson().toJson(RefreshRequest(refreshToken))
                val body = json.toRequestBody("application/json".toMediaType())
                val refreshRequest = Request.Builder()
                    .url("${BuildConfig.API_BASE_URL}api/v1/auth/refresh")
                    .post(body)
                    .build()
                // Offline or server unreachable: keep the session — the request
                // fails but queued offline work must survive until we're back.
                val refreshResponse = try {
                    OkHttpClient().newCall(refreshRequest).execute()
                } catch (e: java.io.IOException) {
                    return null
                }
                if (!refreshResponse.isSuccessful) {
                    // Only a genuine rejection (expired/revoked/reused token)
                    // ends the session. A 5xx is a server problem, not ours.
                    if (refreshResponse.code == 401 || refreshResponse.code == 403) {
                        runBlocking { tokenStore.clear() }
                    }
                    return null
                }
                val tokens = Gson().fromJson(refreshResponse.body?.string(), RefreshResponse::class.java)
                runBlocking {
                    tokenStore.saveTokens(tokens.accessToken, tokens.refreshToken,
                        tokenStore.getTenantId() ?: "")
                }
                return response.request.newBuilder()
                    .header("Authorization", "Bearer ${tokens.accessToken}")
                    .header("X-Retry", "1")
                    .build()
            }
        }

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .authenticator(tokenRefreshAuthenticator)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): VairiotApiService =
        retrofit.create(VairiotApiService::class.java)

    @Provides
    @Singleton
    fun provideUpdateApi(retrofit: Retrofit): com.vairiot.app.update.UpdateApi =
        retrofit.create(com.vairiot.app.update.UpdateApi::class.java)

    @Provides
    @Singleton
    fun provideImageLoader(
        @ApplicationContext context: Context,
        tokenStore: TokenStore,
    ): ImageLoader {
        val authInterceptor = Interceptor { chain ->
            val token = runBlocking { tokenStore.getAccessToken() }
            val request = chain.request().newBuilder().apply {
                if (token != null) addHeader("Authorization", "Bearer $token")
            }.build()
            chain.proceed(request)
        }
        val forceFetchInterceptor = Interceptor { chain ->
            val req = chain.request().newBuilder()
                .cacheControl(okhttp3.CacheControl.FORCE_NETWORK)
                .build()
            chain.proceed(req)
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(forceFetchInterceptor)
            .build()
        return ImageLoader.Builder(context)
            .okHttpClient(client)
            .crossfade(true)
            .build()
    }
}
