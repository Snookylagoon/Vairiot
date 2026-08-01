import Foundation

// MARK: - GS1 helpers
//
// A faithful port of `vairiot-shared/src/gs1` (identifier.ts + digitalLink.ts),
// mirroring the Android `util/Gs1.kt`. The server allocates every Individual
// Asset Reference; the app only validates, formats and resolves scans locally.

enum Gs1 {

    static let markerServer: Character = "1"
    static let markerStandalone: Character = "2"
    static let iarLength = 12
    static let defaultOperationalHost = "id.vairiot.com"

    /// GS1 modulo-10 check digit. Weights 3,1,3,1… from the rightmost body digit.
    static func checkDigit(_ body: String) -> Int? {
        guard !body.isEmpty, body.allSatisfy({ $0.isNumber }) else { return nil }
        var total = 0
        var weight = 3
        for ch in body.reversed() {
            total += ch.wholeNumberValue! * weight
            weight = weight == 3 ? 1 : 3
        }
        return (10 - (total % 10)) % 10
    }

    static func isValidIar(_ iar: String) -> Bool {
        guard iar.count == iarLength, iar.allSatisfy({ $0.isNumber }) else { return false }
        let first = iar.first!
        guard first == markerServer || first == markerStandalone else { return false }
        let body = String(iar.prefix(iarLength - 1))
        return iar.last!.wholeNumberValue == checkDigit(body)
    }

    /// Label form, grouped 1-5-5-1. `tenantMark` is presentation only.
    static func formatHri(_ iar: String, tenantMark: String = "") -> String {
        let chars = Array(iar)
        let grouped = "\(chars[0]) \(String(chars[1...5])) \(String(chars[6...10])) \(chars[11])"
        let mark = tenantMark.trimmingCharacters(in: .whitespaces)
        return mark.isEmpty ? grouped : "\(mark) \(grouped)"
    }

    /// Accepts the grouped HRI or the raw IAR; returns the raw IAR or nil.
    static func parseHri(_ input: String) -> String? {
        let digits = input.filter { $0.isNumber }
        return isValidIar(digits) ? digits : nil
    }

    static func buildGiai(companyPrefix: String, iar: String) -> String? {
        guard isValidIar(iar),
              companyPrefix.count >= 6, companyPrefix.count <= 12,
              companyPrefix.allSatisfy({ $0.isNumber }) else { return nil }
        let giai = companyPrefix + iar
        return giai.count <= 30 ? giai : nil
    }

    /// GS1 Digital Link for an asset — /8004/ GIAI path for GS1-mode tenants,
    /// tenant-scoped path otherwise.
    static func assetDigitalLink(
        mode: String,
        giai: String?,
        iar: String,
        tenantSlug: String,
        host: String = defaultOperationalHost
    ) -> String {
        if mode == "GS1", let giai, !giai.isEmpty {
            return "https://\(host)/8004/\(giai)"
        }
        return "https://\(host)/t/\(tenantSlug)/asset/\(iar)"
    }

    /// GS1-128 element string: AI (8004) for GIAI, AI (91) for internal IARs.
    static func gs1128ElementString(mode: String, giai: String?, iar: String) -> String {
        if mode == "GS1", let giai, !giai.isEmpty { return "(8004)\(giai)" }
        return "(91)\(iar)"
    }

    struct ScanResult: Equatable {
        var giai: String?
        var iar: String?
        var tenantSlug: String?
    }

    /// Local, offline scan resolution. Never calls the network.
    static func parseAssetScan(_ raw: String) -> ScanResult? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.count == iarLength, isValidIar(text) {
            return ScanResult(iar: text)
        }
        guard let url = URL(string: text), url.scheme != nil, url.host != nil else { return nil }
        let path = url.path

        if let match = path.wholeMatch(of: /\/8004\/([0-9A-Za-z!"%&'()*+,\-.\/:;<=>?_]{1,30})/) {
            return ScanResult(giai: String(match.1))
        }
        if let match = path.wholeMatch(of: /\/t\/([a-z0-9-]{2,64})\/asset\/(\d{12})/) {
            let iar = String(match.2)
            if isValidIar(iar) {
                return ScanResult(iar: iar, tenantSlug: String(match.1))
            }
        }
        return nil
    }
}

// MARK: - API models

struct Gs1PrefixResponse: Codable {
    let id: String
    let prefix: String
    let status: String
}

struct IdentificationResponse: Codable {
    let slug: String
    let mode: String?              // "INTERNAL" | "GS1"
    let tenantMark: String?
    let digitalLinkHost: String?
    let activePrefix: Gs1PrefixResponse?
}

struct Gs1EncodingResponse: Codable {
    let mode: String
    var scheme: String?
    var epcHex: String?
    var giai: String?
    let hri: String
    let elementString: String
    let digitalLink: String
}

struct LabelPrintRequest: Codable {
    let assetIds: [String]
    let templateCode: String
    var symbology: String?         // QR | GS1_128 | DATAMATRIX
    var deviceId: String?
    var printerId: String?
}

// MARK: - Identification store

/// Tenant GS1 identification (mode, slug, tenant mark, Digital Link host,
/// active company prefix). Fetched from the server when online and persisted
/// so labels can still be rendered and printed offline.
enum Gs1IdentificationStore {

    private static let defaultsKey = "gs1IdentificationJSON"

    static func fetch(apiClient: APIClient) async -> IdentificationResponse? {
        do {
            let ident: IdentificationResponse = try await apiClient.request(.getIdentification)
            if let data = try? JSONEncoder().encode(ident) {
                UserDefaults.standard.set(data, forKey: defaultsKey)
            }
            return ident
        } catch {
            guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return nil }
            return try? JSONDecoder().decode(IdentificationResponse.self, from: data)
        }
    }

    /// Compute the asset's GS1 encoding locally — the same derivation the
    /// server performs in encodeIdentifier, minus EPC concerns. Works offline.
    static func encodeLocally(
        iar: String,
        assetGiai: String?,
        ident: IdentificationResponse
    ) -> Gs1EncodingResponse? {
        guard Gs1.isValidIar(iar) else { return nil }
        let giai = assetGiai ?? ident.activePrefix.flatMap { Gs1.buildGiai(companyPrefix: $0.prefix, iar: iar) }
        let mode = (ident.mode == "GS1" && giai != nil) ? "GS1" : "INTERNAL"
        let host = (ident.digitalLinkHost?.isEmpty == false) ? ident.digitalLinkHost! : Gs1.defaultOperationalHost
        return Gs1EncodingResponse(
            mode: mode,
            giai: giai,
            hri: Gs1.formatHri(iar, tenantMark: ident.tenantMark ?? ""),
            elementString: Gs1.gs1128ElementString(mode: mode, giai: giai, iar: iar),
            digitalLink: Gs1.assetDigitalLink(mode: mode, giai: giai, iar: iar, tenantSlug: ident.slug, host: host)
        )
    }
}
