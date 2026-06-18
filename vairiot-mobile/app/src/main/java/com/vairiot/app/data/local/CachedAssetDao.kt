package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface CachedAssetDao {
    @Query("""
        SELECT * FROM cached_assets
        WHERE :query = '' OR assetNumber LIKE '%' || :query || '%'
            OR name        LIKE '%' || :query || '%'
            OR barcode     LIKE '%' || :query || '%'
            OR rfidTag     LIKE '%' || :query || '%'
        ORDER BY assetNumber ASC
    """)
    fun searchFlow(query: String): Flow<List<CachedAsset>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(assets: List<CachedAsset>)

    @Query("DELETE FROM cached_assets")
    suspend fun deleteAll()

    @Transaction
    suspend fun replaceAll(assets: List<CachedAsset>) {
        deleteAll()
        upsertAll(assets)
    }
}
