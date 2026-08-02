import Foundation

/// Stores this device's UDID in the Keychain so it survives app updates and
/// can be shown on the Profile screen for future confirmation.
///
/// iOS apps cannot read the UDID themselves — it is captured by the web
/// enrollment flow (/api/v1/ios/udid) and handed back either via the
/// vairiot://udid deep link or by the user pasting it in manually.
enum DeviceUDIDStore {

    private static let key = "vairiot_device_udid"

    static var udid: String? {
        guard let data = KeychainHelper.load(key: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func save(_ raw: String) -> Bool {
        guard let value = normalised(raw), let data = value.data(using: .utf8) else { return false }
        return KeychainHelper.save(key: key, data: data)
    }

    static func clear() {
        KeychainHelper.delete(key: key)
    }

    /// UDIDs are 40-char hex (pre-A12 devices) or dashed hex like
    /// 00008030-001A14E93C38802E (A12 and later). Anything else is rejected.
    static func normalised(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let allowed = CharacterSet(charactersIn: "0123456789ABCDEF-")
        guard value.count >= 24, value.count <= 45,
              !value.isEmpty,
              value.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        return value
    }
}

extension Notification.Name {
    static let vairiotDeviceUDIDSaved = Notification.Name("vairiotDeviceUDIDSaved")
}
