import Foundation
import Combine

@MainActor
@Observable
final class AssetListViewModel {

    // MARK: - Sort

    enum SortField: String, CaseIterable, Identifiable {
        case name
        case assetNumber
        case status
        case condition

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .name:        return "Name"
            case .assetNumber: return "Asset Number"
            case .status:      return "Status"
            case .condition:   return "Condition"
            }
        }
    }

    enum SortOrder: String, CaseIterable, Identifiable {
        case asc
        case desc

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .asc:  return "Ascending"
            case .desc: return "Descending"
            }
        }
    }

    // MARK: - Properties

    var assets: [AssetResponse] = []
    var isLoading: Bool = false
    var isRefreshing: Bool = false
    var isLoadingMore: Bool = false
    var searchQuery: String = "" {
        didSet { scheduleSearch() }
    }
    var selectedStatus: AssetStatus? = nil
    var selectedCondition: AssetCondition? = nil
    var sortBy: SortField = .name
    var sortOrder: SortOrder = .asc
    var errorMessage: String?
    var hasMorePages: Bool = true

    private var currentPage: Int = 1
    private let pageSize: Int = 20
    private var totalCount: Int = 0
    private var searchTask: Task<Void, Never>?

    private let apiClient: APIClient

    // MARK: - Init

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    // MARK: - Load

    func loadInitial() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        currentPage = 1
        await fetchAssets(page: 1, replace: true)
        isLoading = false
    }

    func refresh() async {
        isRefreshing = true
        errorMessage = nil
        currentPage = 1
        await fetchAssets(page: 1, replace: true)
        isRefreshing = false
    }

    func loadMore() async {
        guard !isLoadingMore, hasMorePages else { return }
        isLoadingMore = true
        let nextPage = currentPage + 1
        await fetchAssets(page: nextPage, replace: false)
        isLoadingMore = false
    }

    // MARK: - Search Debounce

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await loadInitial()
        }
    }

    // MARK: - Filter Changes

    func applyFilters() async {
        await loadInitial()
    }

    // MARK: - Fetch

    private func fetchAssets(page: Int, replace: Bool) async {
        do {
            let response: AssetListResponse = try await apiClient.request(
                .listAssets(
                    search: searchQuery.isEmpty ? nil : searchQuery,
                    status: selectedStatus?.rawValue,
                    condition: selectedCondition?.rawValue,
                    sortBy: sortBy.rawValue,
                    sortOrder: sortOrder.rawValue,
                    page: page,
                    pageSize: pageSize
                )
            )

            if replace {
                assets = response.assets
            } else {
                assets.append(contentsOf: response.assets)
            }

            currentPage = response.page
            totalCount = response.total
            hasMorePages = response.page < response.totalPages
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
