import Foundation

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

    let mode: Mode
    private let apiClient: APIClient

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

    init(apiClient: APIClient, existingAsset: AssetResponse? = nil) {
        self.apiClient = apiClient

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
        } else {
            mode = .create
        }
    }

    // MARK: - Load Reference Data

    func loadReferenceData() async {
        isLoading = true

        async let categoriesTask: [CategoryRefResponse] = apiClient.request(.listCategories)
        async let sitesTask: [SiteRefResponse] = apiClient.request(.listSites)

        do {
            let (cats, sts) = try await (categoriesTask, sitesTask)
            categories = cats
            sites = sts

            if let siteId = selectedSiteId {
                await loadLocations(forSiteId: siteId)
            }
        } catch {
            errorMessage = "Failed to load form data"
        }

        isLoading = false
    }

    func loadLocations(forSiteId siteId: String) async {
        isLoadingLocations = true
        do {
            locations = try await apiClient.request(.listSiteLocations(siteId: siteId))
        } catch {
            locations = []
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

    // MARK: - Save

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
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func createAsset() async throws {
        let request = AssetCreateRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            rfidTag: rfidTag.isEmpty ? nil : rfidTag,
            barcode: barcode.isEmpty ? nil : barcode,
            description: description.isEmpty ? nil : description,
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            condition: selectedCondition.rawValue,
            status: selectedStatus.rawValue,
            categoryId: selectedCategoryId,
            siteId: selectedSiteId,
            locationId: selectedLocationId
        )

        let _: AssetResponse = try await apiClient.request(.createAsset(request))
    }

    private func updateAsset(id: String) async throws {
        let request = AssetUpdateRequest(
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

        let _: AssetResponse = try await apiClient.request(.updateAsset(id: id, request))
    }
}
