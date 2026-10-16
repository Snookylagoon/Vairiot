package com.vairiot.app.data

import com.vairiot.app.data.api.AssetClassRefResponse
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.assetClassLabel
import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Stage 2.4: the asset's IPSAS class, read-only on the asset screen. */
class AssetClassLabelTest {

    private val signs = AssetClassRefResponse("c1", "SGN", "Road signs")

    @Test fun `class with its recognition`() {
        assertEquals("SGN · Road signs (recognised)", assetClassLabel(signs, "RECOGNISED"))
        assertEquals("SGN · Road signs (expensed, below threshold)", assetClassLabel(signs, "EXPENSED"))
    }

    @Test fun `no class yet waits for Finance`() {
        assertEquals("None yet (waiting for Finance)", assetClassLabel(null, "PENDING_REVIEW"))
    }

    @Test fun `nothing without an IPSAS ledger`() {
        assertNull(assetClassLabel(null, null))
    }

    @Test fun `reads the fields the API sends, and their absence from an older server`() {
        val json = """{"id":"a1","assetNumber":"AST-1","name":"Sign","status":"active","condition":"good",
            "assetClass":{"id":"c1","code":"SGN","name":"Road signs"},"recognitionStatus":"RECOGNISED"}"""
        val asset = Gson().fromJson(json, AssetResponse::class.java)
        assertEquals("SGN · Road signs (recognised)", assetClassLabel(asset.assetClass, asset.recognitionStatus))
        val old = Gson().fromJson("""{"id":"a1","assetNumber":"AST-1","name":"Sign","status":"active","condition":"good"}""", AssetResponse::class.java)
        assertNull(assetClassLabel(old.assetClass, old.recognitionStatus))
    }
}
