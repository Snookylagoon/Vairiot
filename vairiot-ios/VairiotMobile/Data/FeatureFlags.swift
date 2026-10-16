import Foundation
import Observation

/// The tenant's module switches (Tenant.featureFlags, decision D7), cached in
/// UserDefaults so a screen opened offline still knows whether to show e.g.
/// GIS capture. Off until the server has said otherwise at least once.
@MainActor
@Observable
final class FeatureFlags {

    static let shared = FeatureFlags()
    static let gis = "gis"
    static let ipsas = "ipsas"

    private static let storageKey = "vairiot.featureFlags.enabled"
    private let defaults: UserDefaults
    private(set) var enabled: Set<String>

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        enabled = Set(defaults.stringArray(forKey: Self.storageKey) ?? [])
    }

    func isEnabled(_ flag: String) -> Bool { enabled.contains(flag) }

    var gisEnabled: Bool { isEnabled(Self.gis) }
    var ipsasEnabled: Bool { isEnabled(Self.ipsas) }

    /// Stores the flags from a profile response; only `true` switches a module on.
    func update(from flags: [String: Bool]?) {
        enabled = Set((flags ?? [:]).filter { $0.value }.map { $0.key })
        defaults.set(enabled.sorted(), forKey: Self.storageKey)
    }

    /// Fetches the flags from the server; keeps the cached copy when offline.
    func refresh(apiClient: APIClient = .shared) async {
        guard let profile: UserProfileResponse = try? await apiClient.request(.getMe) else { return }
        update(from: profile.featureFlags)
    }
}
