import SwiftData
import SwiftUI

@main
struct VairiotApp: App {

    private let modelContainer: ModelContainer
    private let tokenManager: TokenManager
    private let apiClient: APIClient

    @Environment(\.scenePhase) private var scenePhase

    init() {
        // App.init runs on the main thread but isn't formally MainActor.
        (modelContainer, tokenManager, apiClient) = MainActor.assumeIsolated {
            // SwiftData container for offline caching (owned by VairiotStore
            // so view models and SyncManager can reach the context directly)
            SyncManager.shared.start()
            return (VairiotStore.shared.container, TokenManager.shared, APIClient.shared)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView(apiClient: apiClient, tokenManager: tokenManager)
                .tint(.vairiotPink)
        }
        .modelContainer(modelContainer)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await SyncManager.shared.syncNow() }
            }
        }
    }
}

// MARK: - Root View

/// Switches between login and main content based on authentication state.
private struct RootView: View {

    let apiClient: APIClient
    let tokenManager: TokenManager

    @State private var isAuthenticated: Bool

    init(apiClient: APIClient, tokenManager: TokenManager) {
        self.apiClient = apiClient
        self.tokenManager = tokenManager
        _isAuthenticated = State(initialValue: tokenManager.isLoggedIn)
    }

    var body: some View {
        Group {
            if isAuthenticated {
                ContentView(apiClient: apiClient, tokenManager: tokenManager)
            } else {
                LoginView(apiClient: apiClient, tokenManager: tokenManager)
            }
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .vairiotAuthStateChanged)
        ) { notification in
            if let loggedIn = notification.object as? Bool {
                isAuthenticated = loggedIn
            } else {
                isAuthenticated = tokenManager.isLoggedIn
            }
        }
    }
}

// MARK: - Auth Notification

extension Notification.Name {
    static let vairiotAuthStateChanged = Notification.Name("vairiotAuthStateChanged")
}
