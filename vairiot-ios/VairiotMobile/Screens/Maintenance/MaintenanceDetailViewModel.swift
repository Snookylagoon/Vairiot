import Foundation
import SwiftUI
import UIKit

@MainActor
@Observable
final class MaintenanceDetailViewModel {

    // MARK: - State

    var event: MaintenanceEventResponse?
    var photos: [PhotoResponse] = []
    var isLoading = false
    var isUpdating = false
    var isUploadingPhoto = false
    var errorMessage: String?
    var successMessage: String?
    var showEditSheet = false
    var showPhotoPicker = false

    // MARK: - Edit form fields

    var editStatus: String = ""
    var editNotes: String = ""
    var editCompletedDate: Date = Date()
    var shouldSetCompletedDate = false

    // MARK: - Dependencies

    private let eventId: String
    private let apiClient: APIClient

    // MARK: - Init

    init(eventId: String, apiClient: APIClient = .shared) {
        self.eventId = eventId
        self.apiClient = apiClient
    }

    // MARK: - Load

    func loadEvent() async {
        isLoading = true
        errorMessage = nil

        do {
            event = try await apiClient.request(.getMaintenanceEvent(id: eventId))
            if let event {
                editStatus = event.status
                editNotes = event.notes ?? ""
            }
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadPhotos() async {
        do {
            photos = try await apiClient.request(.listMaintenancePhotos(maintenanceId: eventId))
        } catch {
            // Photos are non-critical; silently fail.
        }
    }

    // MARK: - Update

    func updateEvent() async {
        isUpdating = true
        errorMessage = nil

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime]

        let request = MaintenanceUpdateRequest(
            status: editStatus,
            notes: editNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : editNotes,
            completedDate: shouldSetCompletedDate ? isoFormatter.string(from: editCompletedDate) : nil
        )

        do {
            event = try await apiClient.request(.updateMaintenanceEvent(id: eventId, request))
            showEditSheet = false
            successMessage = "Maintenance event updated"
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isUpdating = false
    }

    // MARK: - Upload Photo

    func uploadPhoto(imageData: Data, thumbData: Data?) async {
        isUploadingPhoto = true
        errorMessage = nil

        let uploadPath = "\(APIEndpoint.uploadMaintenancePhotoPath)/\(eventId)/photos"

        do {
            let photo: PhotoResponse = try await apiClient.upload(
                path: uploadPath,
                imageData: imageData,
                thumbData: thumbData
            )
            photos.append(photo)
            successMessage = "Photo uploaded"
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isUploadingPhoto = false
    }

    // MARK: - Helpers

    func prepareEditForm() {
        guard let event else { return }
        editStatus = event.status
        editNotes = event.notes ?? ""
        shouldSetCompletedDate = event.completedDate != nil

        if let completedStr = event.completedDate {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: completedStr) ?? ISO8601DateFormatter().date(from: completedStr) {
                editCompletedDate = date
            }
        }
    }

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
