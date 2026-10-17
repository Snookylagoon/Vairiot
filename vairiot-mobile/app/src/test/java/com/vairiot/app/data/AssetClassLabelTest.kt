package com.vairiot.app.data

import com.vairiot.app.data.api.AssetClassRefResponse
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.ComponentRefResponse
import com.vairiot.app.data.api.assetClassLabel
import com.vairiot.app.data.api.componentLabel
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

    @Test fun `parts and parent from the API (stage 2_6)`() {
        val json = """{"id":"p1","assetNumber":"AST-1","name":"Junction","status":"active","condition":"good",
            "components":[{"id":"c1","assetNumber":"AST-2","name":"Junction — Controller","componentRole":"controller","status":"active"}]}"""
        val asset = Gson().fromJson(json, AssetResponse::class.java)
        assertEquals(1, asset.components?.size)
        assertEquals("Controller · AST-2 Junction — Controller", componentLabel(asset.components!!.first()))
        assertEquals("AST-3 Loose part", componentLabel(ComponentRefResponse("c2", "AST-3", "Loose part", null, "active")))
        val part = Gson().fromJson("""{"id":"c1","assetNumber":"AST-2","name":"C","status":"active","condition":"good",
            "parentAsset":{"id":"p1","assetNumber":"AST-1","name":"Junction"}}""", AssetResponse::class.java)
        assertEquals("AST-1", part.parentAsset?.assetNumber)
    }

    @Test fun `custodian from the API, absent from an older server (stage 2_7)`() {
        val asset = Gson().fromJson("""{"id":"a1","assetNumber":"AST-1","name":"Cabinet","status":"active","condition":"good","custodian":"Signals Unit"}""", AssetResponse::class.java)
        assertEquals("Signals Unit", asset.custodian)
        assertNull(Gson().fromJson("""{"id":"a1","assetNumber":"AST-1","name":"Cabinet","status":"active","condition":"good"}""", AssetResponse::class.java).custodian)
    }
}
