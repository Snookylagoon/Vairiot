import Foundation

// MARK: - HTTP Method

enum HTTPMethod: String {
    case get    = "GET"
    case post   = "POST"
    case patch  = "PATCH"
    case delete = "DELETE"
}

// MARK: - API Endpoint

struct APIEndpoint {
    let method: HTTPMethod
    let path: String
    let body: (any Encodable)?
    let queryItems: [URLQueryItem]

    init(
        method: HTTPMethod,
        path: String,
        body: (any Encodable)? = nil,
        queryItems: [URLQueryItem] = []
    ) {
        self.method = method
        self.path = path
        self.body = body
        self.queryItems = queryItems
    }
}

// MARK: - Auth Endpoints

extension APIEndpoint {

    static func login(_ request: LoginRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/login", body: request)
    }

    static func refresh(_ request: RefreshRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/refresh", body: request)
    }

    static func loginWith2FA(_ request: TwoFactorLoginRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/login/2fa", body: request)
    }

    static func forcedPasswordChange(_ request: ForcedPasswordChangeRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/change-password/forced", body: request)
    }

    static func generate2FASetup(_ request: TwoFactorSetupGenerateRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/2fa-setup/generate", body: request)
    }

    static func verify2FASetup(_ request: TwoFactorSetupVerifyRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/auth/2fa-setup/verify", body: request)
    }

    static var getMe: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/auth/me")
    }
}

// MARK: - Licence Endpoints

extension APIEndpoint {

    static var getLicenceStatus: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/licences/status")
    }

    static func deviceHeartbeat(_ request: DeviceHeartbeatRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/licences/devices/heartbeat", body: request)
    }
}

// MARK: - Asset Endpoints

extension APIEndpoint {

    static func listAssets(
        search: String? = nil,
        status: String? = nil,
        condition: String? = nil,
        sortBy: String? = nil,
        sortOrder: String? = nil,
        page: Int = 1,
        pageSize: Int = 25
    ) -> APIEndpoint {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
        ]
        if let search    { items.append(URLQueryItem(name: "search", value: search)) }
        if let status    { items.append(URLQueryItem(name: "status", value: status)) }
        if let condition { items.append(URLQueryItem(name: "condition", value: condition)) }
        if let sortBy    { items.append(URLQueryItem(name: "sortBy", value: sortBy)) }
        if let sortOrder { items.append(URLQueryItem(name: "sortOrder", value: sortOrder)) }
        return APIEndpoint(method: .get, path: "api/v1/assets", queryItems: items)
    }

    static func getAsset(id: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/assets/\(id)")
    }

    static func getAssetByTag(tag: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/assets/tag/\(tag)")
    }

    static func createAsset(_ request: AssetCreateRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/assets", body: request)
    }

    static func updateAsset(id: String, _ request: AssetUpdateRequest) -> APIEndpoint {
        APIEndpoint(method: .patch, path: "api/v1/assets/\(id)", body: request)
    }

    static func deleteAsset(id: String) -> APIEndpoint {
        APIEndpoint(method: .delete, path: "api/v1/assets/\(id)")
    }
}

// MARK: - Sites / Locations / Categories

extension APIEndpoint {

    static var listSites: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/sites")
    }

    static func listSiteLocations(siteId: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/sites/\(siteId)/locations")
    }

    static var listCategories: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/categories")
    }

    static func createSite(_ body: [String: String]) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/sites", body: body)
    }

    static func createSiteLocation(siteId: String, _ body: [String: String]) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/sites/\(siteId)/locations", body: body)
    }

    static func createCategory(_ body: [String: String]) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/categories", body: body)
    }
}

// MARK: - Company

extension APIEndpoint {

    static var getCompany: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/onboarding/company")
    }
}

// MARK: - Audit Endpoints

extension APIEndpoint {

    static var listAudits: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/audits")
    }

    static func createAudit(_ request: CreateAuditRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/audits", body: request)
    }

    static func startAudit(id: String) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/audits/\(id)/start")
    }

    static func recordAuditScan(campaignId: String, _ request: RecordScanRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/audits/\(campaignId)/scans", body: request)
    }

    static func submitAuditZone(campaignId: String, locationId: String) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/audits/\(campaignId)/zones/\(locationId)/submit")
    }

    static func listAuditZones(campaignId: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/audits/\(campaignId)/zones")
    }

    static func completeAudit(id: String) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/audits/\(id)/complete")
    }

    static func getAuditReport(id: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/audits/\(id)/report")
    }
}

// MARK: - Photo Endpoints

extension APIEndpoint {

    static func listAssetPhotos(assetId: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/assets/\(assetId)/photos")
    }

    /// Photo upload is handled separately via APIClient.upload(...)
    static let uploadAssetPhotoPath = "api/v1/assets"

    static func downloadPhoto(id: String, thumb: Bool = false) -> APIEndpoint {
        var items: [URLQueryItem] = []
        if thumb {
            items.append(URLQueryItem(name: "thumb", value: "true"))
        }
        return APIEndpoint(method: .get, path: "api/v1/photos/\(id)/download", queryItems: items)
    }

    static func updatePhoto(id: String, _ request: PhotoUpdateRequest) -> APIEndpoint {
        APIEndpoint(method: .patch, path: "api/v1/photos/\(id)", body: request)
    }

    static func deletePhoto(id: String) -> APIEndpoint {
        APIEndpoint(method: .delete, path: "api/v1/photos/\(id)")
    }
}

// MARK: - Maintenance Endpoints

extension APIEndpoint {

    static func listMaintenanceEvents(
        status: String? = nil,
        search: String? = nil,
        sortBy: String? = nil,
        sortOrder: String? = nil,
        page: Int = 1,
        pageSize: Int = 25
    ) -> APIEndpoint {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
        ]
        if let status    { items.append(URLQueryItem(name: "status", value: status)) }
        if let search    { items.append(URLQueryItem(name: "search", value: search)) }
        if let sortBy    { items.append(URLQueryItem(name: "sortBy", value: sortBy)) }
        if let sortOrder { items.append(URLQueryItem(name: "sortOrder", value: sortOrder)) }
        return APIEndpoint(method: .get, path: "api/v1/maintenance", queryItems: items)
    }

    static func getMaintenanceEvent(id: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/maintenance/\(id)")
    }

    static func createMaintenanceEvent(_ request: MaintenanceCreateRequest) -> APIEndpoint {
        APIEndpoint(method: .post, path: "api/v1/maintenance", body: request)
    }

    static func updateMaintenanceEvent(id: String, _ request: MaintenanceUpdateRequest) -> APIEndpoint {
        APIEndpoint(method: .patch, path: "api/v1/maintenance/\(id)", body: request)
    }

    static func listMaintenancePhotos(maintenanceId: String) -> APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/maintenance/\(maintenanceId)/photos")
    }

    /// Maintenance photo upload is handled via APIClient.upload(...)
    static let uploadMaintenancePhotoPath = "api/v1/maintenance"
}
