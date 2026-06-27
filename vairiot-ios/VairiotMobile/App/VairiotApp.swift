import SwiftData
import SwiftUI

@main
struct VairiotApp: App {

    private let modelContainer: ModelContainer
    private let tokenManager: TokenManager
    private let apiClient: APIClient

    init() {
        // SwiftData container for offline caching
        let schema = Schema([CachedAsset.self, QueuedScan.self])
        let configuration = ModelConfiguration(
            "VairiotStore",
            schema: schema,
            isStoredInMemoryOnly: false
        )
        do {
            modelContainer = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create SwiftData container: \(error)")
        }

        // Shared singletons
        tokenManager = .shared
        apiClient = .shared
    }

    var body: some Scene {
        WindowGroup {
            RootView(apiClient: apiClient, tokenManager: tokenManager)
                .tint(.vairiotPink)
        }
        .modelContainer(modelContainer)
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
