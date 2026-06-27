import Foundation

// MARK: - Login

struct LoginRequest: Codable {
    let email: String
    let password: String
    let tenantId: String
    var device: DeviceCheckIn?
}

struct DeviceCheckIn: Codable {
    let fingerprint: String
    let deviceName: String
    var deviceType: String = "mobile"
}

// MARK: - Device Heartbeat

struct DeviceHeartbeatRequest: Codable {
    let fingerprint: String
}

struct DeviceHeartbeatResponse: Codable {
    var online: Bool = false
    var active: Bool = false
}

// MARK: - Login Response

struct LoginResponse: Codable {
    let accessToken: String?
    let refreshToken: String?
    let expiresIn: String?
    let requiresTwoFactor: Bool?
    let twoFactorChallengeToken: String?
    let requiresTwoFactorSetup: Bool?
    let twoFactorSetupToken: String?
    let requiresPasswordChange: Bool?
    let passwordChangeToken: String?
}

// MARK: - Two-Factor Auth

struct TwoFactorLoginRequest: Codable {
    let challengeToken: String
    let token: String
    var device: DeviceCheckIn?
}

struct TwoFactorSetupGenerateRequest: Codable {
    let setupToken: String
}

struct TwoFactorSetupResponse: Codable {
    let secret: String
    let otpauthUrl: String
    let backupCodes: [String]
}

struct TwoFactorSetupVerifyRequest: Codable {
    let setupToken: String
    let token: String
    var device: DeviceCheckIn?
}

// MARK: - Forced Password Change

struct ForcedPasswordChangeRequest: Codable {
    let challengeToken: String
    let currentPassword: String
    let newPassword: String
    var device: DeviceCheckIn?
}

// MARK: - User Profile

struct UserProfileResponse: Codable {
    let userId: String
    let email: String
    let tenantId: String
    let tenantName: String?
    let roles: [String]
    var permissions: [String] = []
    var featureFlags: [String: Bool]?
}

// MARK: - Licence

struct LicenceStatusResponse: Codable {
    let licenceId: String
    let licenceNumber: String
    let tierName: String
    let tierDisplayName: String
    let status: String
    let activatedAt: String?
    let expiresAt: String?
    let daysRemaining: Int?
    let paymentConfirmed: Bool
}

// MARK: - Token Refresh

struct RefreshRequest: Codable {
    let refreshToken: String
}

struct RefreshResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: String
}

// MARK: - Local Convenience Types

struct AuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: String
}

struct UserProfile: Codable {
    let userId: String
    let email: String
    let tenantId: String
    let roles: [String]
}
