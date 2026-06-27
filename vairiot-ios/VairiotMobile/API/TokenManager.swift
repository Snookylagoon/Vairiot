import Foundation
import Security

// MARK: - Keychain Helper

private enum KeychainHelper {

    static func save(key: String, data: Data) -> Bool {
        delete(key: key)
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String:  key,
            kSecAttrService as String:  "com.vairiot.mobile",
            kSecValueData as String:    data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    static func load(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String:  key,
            kSecAttrService as String:  "com.vairiot.mobile",
            kSecReturnData as String:   true,
            kSecMatchLimit as String:   kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    @discardableResult
    static func delete(key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String:  key,
            kSecAttrService as String:  "com.vairiot.mobile",
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

// MARK: - Token Manager

final class TokenManager: @unchecked Sendable {

    static let shared = TokenManager()

    private let queue = DispatchQueue(label: "com.vairiot.tokenmanager", attributes: .concurrent)

    private enum Keys {
        static let accessToken  = "vairiot_access_token"
        static let refreshToken = "vairiot_refresh_token"
        static let tenantId     = "vairiot_tenant_id"
    }

    private init() {}

    // MARK: - Accessors

    var accessToken: String? {
        get { loadString(Keys.accessToken) }
    }

    var refreshToken: String? {
        get { loadString(Keys.refreshToken) }
    }

    var tenantId: String? {
        get { loadString(Keys.tenantId) }
    }

    var isLoggedIn: Bool {
        accessToken != nil && refreshToken != nil
    }

    // MARK: - Save / Clear

    func save(tokens: AuthTokens, tenantId: String) {
        queue.sync(flags: .barrier) {
            self.saveString(Keys.accessToken, value: tokens.accessToken)
            self.saveString(Keys.refreshToken, value: tokens.refreshToken)
            self.saveString(Keys.tenantId, value: tenantId)
        }
    }

    func updateAccessToken(_ token: String) {
        queue.sync(flags: .barrier) {
            self.saveString(Keys.accessToken, value: token)
        }
    }

    func clear() {
        queue.sync(flags: .barrier) {
            KeychainHelper.delete(key: Keys.accessToken)
            KeychainHelper.delete(key: Keys.refreshToken)
            KeychainHelper.delete(key: Keys.tenantId)
        }
    }

    // MARK: - Private

    private func loadString(_ key: String) -> String? {
        queue.sync {
            guard let data = KeychainHelper.load(key: key) else { return nil }
            return String(data: data, encoding: .utf8)
        }
    }

    private func saveString(_ key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        _ = KeychainHelper.save(key: key, data: data)
    }
}
