import Foundation
import SwiftUI

@MainActor
@Observable
final class MaintenanceListViewModel {

    // MARK: - State

    var events: [MaintenanceEventResponse] = []
    var isLoading = false
    var isLoadingMore = false
    var searchQuery = ""
    var selectedStatus: String?
    var page = 1
    var totalPages = 1
    var errorMessage: String?

    // MARK: - Status Filter Options

    static let statusOptions: [(label: String, value: String?)] = [
        ("All", nil),
        ("Scheduled", "scheduled"),
        ("In Progress", "in_progress"),
        ("Completed", "completed"),
        ("Cancelled", "cancelled"),
    ]

    // MARK: - Dependencies

    private let apiClient: APIClient
    private let pageSize = 25
    private var searchTask: Task<Void, Never>?

    // MARK: - Init

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Load

    func loadEvents(reset: Bool = true) async {
        if reset {
            page = 1
            isLoading = true
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        let trimmedSearch = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let response: MaintenanceListResponse = try await apiClient.request(
                .listMaintenanceEvents(
                    status: selectedStatus,
                    search: trimmedSearch.isEmpty ? nil : trimmedSearch,
                    sortBy: "createdAt",
                    sortOrder: "desc",
                    page: page,
                    pageSize: pageSize
                )
            )

            if reset {
                events = response.events
            } else {
                events.append(contentsOf: response.events)
            }

            totalPages = response.totalPages
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        isLoadingMore = false
    }

    // MARK: - Pagination

    func loadNextPage() async {
        guard !isLoadingMore, page < totalPages else { return }
        page += 1
        await loadEvents(reset: false)
    }

    func shouldLoadMore(for event: MaintenanceEventResponse) -> Bool {
        guard let lastEvent = events.last else { return false }
        return event.id == lastEvent.id && page < totalPages
    }

    // MARK: - Search (debounced)

    func performSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await loadEvents(reset: true)
        }
    }

    // MARK: - Filter

    func applyStatusFilter(_ status: String?) {
        selectedStatus = status
        Task { await loadEvents(reset: true) }
    }

    // MARK: - Helpers

    func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "scheduled":   return .blue
        case "in_progress": return .warningAmber
        case "completed":   return .successGreen
        case "cancelled":   return .gray
        default:            return .gray
        }
    }

    func statusLabel(for status: String) -> String {
        switch status.lowercased() {
        case "scheduled":   return "Scheduled"
        case "in_progress": return "In Progress"
        case "completed":   return "Completed"
        case "cancelled":   return "Cancelled"
        default:            return status.capitalized
        }
    }
}
