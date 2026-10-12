import Foundation

/// An asset's GIS position as shown in the app: a fresh device fix, or the
/// position the server already holds.
struct AssetPosition: Hashable {
    let latitude: Double
    let longitude: Double
    var accuracyMeters: Double?
    var source: String?

    init(latitude: Double, longitude: Double, accuracyMeters: Double? = nil, source: String? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracyMeters = accuracyMeters
        self.source = source
    }

    init(_ fix: GeoFix) {
        self.init(latitude: fix.latitude, longitude: fix.longitude,
                  accuracyMeters: fix.accuracyMeters, source: "device")
    }

    init?(_ asset: AssetResponse) {
        guard let latitude = asset.latitude, let longitude = asset.longitude else { return nil }
        self.init(latitude: latitude, longitude: longitude,
                  accuracyMeters: asset.geoAccuracyMeters, source: asset.geoSource)
    }

    /// "41.715100, 44.827100"
    var coordinateText: String {
        String(format: "%.6f, %.6f", latitude, longitude)
    }

    /// "±6 m · Device GPS"
    var detailText: String? {
        let parts = [
            accuracyMeters.map { "±\(Int($0.rounded())) m" },
            source.map(Self.sourceLabel),
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var appleMapsURL: URL? {
        URL(string: "https://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(latitude),\(longitude)")
    }

    static func sourceLabel(_ source: String) -> String {
        switch source {
        case "device": "Device GPS"
        case "manual": "Entered manually"
        case "import": "Imported"
        default: source
        }
    }
}
