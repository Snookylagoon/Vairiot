package com.vairiot.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors vairiot-shared/src/__tests__/gs1.test.ts so the ports can't drift. */
class Gs1Test {

    @Test
    fun `check digit matches GS1 modulo 10`() {
        // GTIN-13 body 629104150021 → check 3 (GS1 worked example)
        assertEquals(3, Gs1.checkDigit("629104150021"))
        assertEquals(4, Gs1.checkDigit("10000012345"))
    }

    @Test
    fun `valid server and standalone iars`() {
        assertTrue(Gs1.isValidIar("100000123454"))
        assertFalse(Gs1.isValidIar("100000123455")) // bad check digit
        assertFalse(Gs1.isValidIar("300000123454")) // unknown marker
        assertFalse(Gs1.isValidIar("10000012345"))  // wrong length
    }

    @Test
    fun `hri formats grouped 1-5-5-1 with optional tenant mark`() {
        assertEquals("1 00000 12345 4", Gs1.formatHri("100000123454"))
        assertEquals("ACME 1 00000 12345 4", Gs1.formatHri("100000123454", "ACME"))
    }

    @Test
    fun `parseHri accepts grouped and raw forms`() {
        assertEquals("100000123454", Gs1.parseHri("1 00000 12345 4"))
        assertEquals("100000123454", Gs1.parseHri("ACME 1 00000 12345 4"))
        assertEquals("100000123454", Gs1.parseHri("100000123454"))
        assertNull(Gs1.parseHri("1 00000 12345 5"))
    }

    @Test
    fun `buildGiai concatenates prefix and iar`() {
        assertEquals("952114110100000123454", Gs1.buildGiai("952114110", "100000123454"))
        assertNull(Gs1.buildGiai("95211", "100000123454"))   // prefix too short
        assertNull(Gs1.buildGiai("952114110", "x00000123454"))
    }

    @Test
    fun `digital link paths per mode`() {
        assertEquals(
            "https://id.vairiot.com/8004/952114110100000123454",
            Gs1.assetDigitalLink("GS1", "952114110100000123454", "100000123454", "acme"),
        )
        assertEquals(
            "https://id.vairiot.com/t/acme/asset/100000123454",
            Gs1.assetDigitalLink("INTERNAL", null, "100000123454", "acme"),
        )
    }

    @Test
    fun `gs1-128 element strings`() {
        assertEquals("(8004)952114110100000123454", Gs1.gs1128ElementString("GS1", "952114110100000123454", "100000123454"))
        assertEquals("(91)100000123454", Gs1.gs1128ElementString("INTERNAL", null, "100000123454"))
    }

    @Test
    fun `parseAssetScan resolves raw iar, giai links and internal links`() {
        assertEquals(Gs1.ScanResult(iar = "100000123454"), Gs1.parseAssetScan("100000123454"))
        assertEquals(
            Gs1.ScanResult(giai = "952114110100000123454"),
            Gs1.parseAssetScan("https://id.vairiot.com/8004/952114110100000123454"),
        )
        assertEquals(
            Gs1.ScanResult(iar = "100000123454", tenantSlug = "acme"),
            Gs1.parseAssetScan("https://id.vairiot.com/t/acme/asset/100000123454"),
        )
        assertNull(Gs1.parseAssetScan("VAI-000123"))          // plain asset number
        assertNull(Gs1.parseAssetScan("100000123455"))        // bad check digit
        assertNull(Gs1.parseAssetScan("""{"id":"abc"}"""))    // legacy QR JSON
    }
}
