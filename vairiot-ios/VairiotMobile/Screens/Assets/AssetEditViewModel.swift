import Foundation
import SwiftData

@MainActor
@Observable
final class AssetEditViewModel {

    // MARK: - Mode

    enum Mode {
        case create
        case edit(AssetResponse)
    }

    // MARK: - Properties

    var name: String = ""
    var description: String = ""
    var serialNumber: String = ""
    var barcode: String = ""
    var rfidTag: String = ""
    var notes: String = ""
    var selectedStatus: AssetStatus = .active
    var selectedCondition: AssetCondition = .good
    var selectedCategoryId: String?
    var selectedSiteId: String?
    var selectedLocationId: String?

    var categories: [CategoryRefResponse] = []
    var sites: [SiteRefResponse] = []
    var locations: [LocationRefResponse] = []

    var isLoading: Bool = false
    var isSaving: Bool = false
    var isLoadingLocations: Bool = false
    var errorMessage: String?
    var isSaved: Bool = false
    var savedOffline: Bool = false

    // GIS position
    var position: AssetPosition?
    var isCapturingPosition: Bool = false
    var positionError: String?
    var positionAccessDenied: Bool = false
    /// The fix taken in this form, if any. Nil when the position shown came
    /// from the server, or was removed.
    private(set) var capturedFix: GeoFix?
    /// Whether the user captured or removed a position; only then is it sent.
    private(set) var positionChanged: Bool = false

    let mode: Mode
    private let apiClient: APIClient
    private let positionProvider: PositionProviding
    /// Tenant module switches; GIS off means no position is sent (D7).
    let featureFlags: FeatureFlags

    // MARK: - Computed

    var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    var navigationTitle: String {
        isEditing ? "Edit Asset" : "New Asset"
    }

    var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Init

    init(
        apiClient: APIClient,
        existingAsset: AssetResponse? = nil,
        prefillBarcode: String? = nil,
        positionProvider: PositionProviding? = nil,
        featureFlags: FeatureFlags = .shared
    ) {
        self.apiClient = apiClient
        self.featureFlags = featureFlags
        self.positionProvider = positionProvider ?? DevicePositionProvider()

        if let asset = existingAsset {
            mode = .edit(asset)
            name = asset.name
            description = asset.description ?? ""
            serialNumber = asset.serialNumber ?? ""
            barcode = asset.barcode ?? ""
            rfidTag = asset.rfidTag ?? ""
            selectedStatus = asset.assetStatus ?? .active
            selectedCondition = asset.assetCondition ?? .good
            selectedCategoryId = asset.category?.id
            selectedSiteId = asset.site?.id
            selectedLocationId = asset.location?.id
            position = AssetPosition(asset)
        } else {
            mode = .create
            barcode = prefillBarcode ?? ""
        }
    }

    // MARK: - Load Reference Data

    func loadReferenceData() async {
        isLoading = true
        Task { await featureFlags.refresh(apiClient: apiClient) }

        async let categoriesTask: [CategoryRefResponse] = apiClient.request(.listCategories)
        async let sitesTask: [SiteRefResponse] = apiClient.request(.listSites)

        do {
            let (cats, sts) = try await (categoriesTask, sitesTask)
            categories = cats
            sites = sts
            ReferenceCache.store(kind: "category", items: cats.map { ($0.id, $0.name) })
            ReferenceCache.store(kind: "site", items: sts.map { ($0.id, $0.name) })

            if let siteId = selectedSiteId {
                await loadLocations(forSiteId: siteId)
            }
        } catch {
            // Offline: serve the cached reference lists so the pickers work.
            categories = ReferenceCache.load(kind: "category")
                .map { CategoryRefResponse(id: $0.id, name: $0.name) }
            sites = ReferenceCache.load(kind: "site")
                .map { SiteRefResponse(id: $0.id, name: $0.name) }
            if categories.isEmpty && sites.isEmpty {
                errorMessage = "Failed to load form data"
            }
            if let siteId = selectedSiteId {
                await loadLocations(forSiteId: siteId)
            }
        }

        isLoading = false
    }

    func loadLocations(forSiteId siteId: String) async {
        isLoadingLocations = true
        do {
            let locs: [LocationRefResponse] = try await apiClient.request(.listSiteLocations(siteId: siteId))
            locations = locs
            ReferenceCache.store(kind: "location", items: locs.map { ($0.id, $0.name) }, parentId: siteId)
        } catch {
            locations = ReferenceCache.load(kind: "location", parentId: siteId)
                .map { LocationRefResponse(id: $0.id, name: $0.name) }
        }
        isLoadingLocations = false
    }

    func onSiteChanged() {
        selectedLocationId = nil
        locations = []

        if let siteId = selectedSiteId {
            Task { await loadLocations(forSiteId: siteId) }
        }
    }

    // MARK: - Create Reference Data

    func createSite(name: String) async {
        do {
            let site: SiteRefResponse = try await apiClient.request(.createSite(["name": name]))
            sites.append(site)
            selectedSiteId = site.id
            selectedLocationId = nil
            locations = []
        } catch {
            errorMessage = "Failed to create site"
        }
    }

    func createLocation(name: String) async {
        guard let siteId = selectedSiteId else {
            errorMessage = "Select a site first"
            return
        }
        do {
            let loc: LocationRefResponse = try await apiClient.request(.createSiteLocation(siteId: siteId, ["name": name]))
            locations.append(loc)
            selectedLocationId = loc.id
        } catch {
            errorMessage = "Failed to create location"
        }
    }

    func createCategory(name: String) async {
        do {
            let cat: CategoryRefResponse = try await apiClient.request(.createCategory(["name": name]))
            categories.append(cat)
            selectedCategoryId = cat.id
        } catch {
            errorMessage = "Failed to create category"
        }
    }

    // MARK: - GIS Position

    func capturePosition() async {
        guard !isCapturingPosition else { return }
        isCapturingPosition = true
        positionError = nil
        positionAccessDenied = false
        do {
            let fix = try await positionProvider.currentFix()
            capturedFix = fix
            position = AssetPosition(fix)
            positionChanged = true
        } catch let error as PositionCaptureError {
            positionError = error.errorDescription
            positionAccessDenied = error == .denied
        } catch {
            positionError = error.localizedDescription
        }
        isCapturingPosition = false
    }

    func removePosition() {
        capturedFix = nil
        position = nil
        positionChanged = true
        positionError = nil
    }

    // MARK: - Save

    /// One idempotency key for this form, sent on every online try and reused
    /// as the queued row's id. If a create times out after the server stored
    /// it, the retry or queued replay returns that asset instead of a duplicate.
    private let createRequestId = UUID()

    func save() async {
        guard isFormValid else {
            errorMessage = "Asset name is required"
            return
        }

        isSaving = true
        errorMessage = nil

        do {
            switch mode {
            case .create:
                try await createAsset()
            case .edit(let existing):
                try await updateAsset(id: existing.id)
            }
            isSaved = true
        } catch let error as APIError {
            if case .networkError = error, case .create = mode {
                // Offline: queue the create for background sync and show a
                // provisional entry in the cached asset list.
                queueOfflineCreate()
                savedOffline = true
                isSaved = true
            } else {
                errorMessage = error.userMessage
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func queueOfflineCreate() {
        let queued = QueuedAssetCreate(
            localId: createRequestId,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            assetDescription: description.isEmpty ? nil : description,
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            barcode: barcode.isEmpty ? nil : barcode,
            rfidTag: rfidTag.isEmpty ? nil : rfidTag,
            status: selectedStatus.rawValue,
            condition: selectedCondition.rawValue,
            categoryId: selectedCategoryId,
            siteId: selectedSiteId,
            locationId: selectedLocationId,
            geoFix: capturedFix
        )

        let context = VairiotStore.shared.context
        context.insert(queued)
        context.insert(CachedAsset(
            id: queued.provisionalCacheId,
            assetNumber: "PENDING",
            name: queued.name,
            assetDescription: queued.assetDescription,
            status: queued.status,
            condition: queued.condition,
            serialNumber: queued.serialNumber,
            barcode: queued.barcode,
            rfidTag: queued.rfidTag,
            categoryName: categories.first(where: { $0.id == queued.categoryId })?.name,
            siteName: sites.first(where: { $0.id == queued.siteId })?.name,
            locationName: locations.first(where: { $0.id == queued.locationId })?.name,
            latitude: queued.latitude,
            longitude: queued.longitude,
            geoAccuracyMeters: queued.geoAccuracyMeters,
            geoSource: queued.latitude == nil ? nil : "device"
        ))
        try? context.save()
    }

    private func createAsset() async throws {
        var request = AssetCreateRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            rfidTag: rfidTag.isEmpty ? nil : rfidTag,
            barcode: barcode.isEmpty ? nil : barcode,
            description: description.isEmpty ? nil : description,
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            condition: selectedCondition.rawValue,
            status: selectedStatus.rawValue,
            categoryId: selectedCategoryId,
            siteId: selectedSiteId,
            locationId: selectedLocationId,
            clientRequestId: createRequestId.uuidString
        )
        if let fix = capturedFix {
            request.latitude = fix.latitude
            request.longitude = fix.longitude
            request.geoAccuracyMeters = fix.accuracyMeters
            request.geoSource = "device"
            request.geoCapturedAt = ISO8601DateFormatter().string(from: fix.capturedAt)
        }

        let _: AssetResponse = try await apiClient.request(.createAsset(request))
    }

    private func updateAsset(id: String) async throws {
        let _: AssetResponse = try await apiClient.request(.updateAsset(id: id, updateRequest()))
    }

    /// The PATCH body for an edit. The position is only sent when the user
    /// captured or removed one, so a save never restamps the server's copy.
    func updateRequest() -> AssetUpdateRequest {
        var request = AssetUpdateRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.isEmpty ? nil : description,
            status: selectedStatus.rawValue,
            condition: selectedCondition.rawValue,
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            barcode: barcode.isEmpty ? nil : barcode,
            rfidTag: rfidTag.isEmpty ? nil : rfidTag,
            notes: notes.isEmpty ? nil : notes,
            siteId: selectedSiteId,
            locationId: selectedLocationId
        )
        if positionChanged, featureFlags.gisEnabled {
            if let fix = capturedFix {
                request.latitude = fix.latitude
                request.longitude = fix.longitude
                request.geoAccuracyMeters = fix.accuracyMeters
                request.geoSource = "device"
                request.geoCapturedAt = ISO8601DateFormatter().string(from: fix.capturedAt)
            } else {
                request.clearGeoPosition = true
            }
        }
        return request
    }
}
