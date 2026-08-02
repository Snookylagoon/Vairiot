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
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
        .modelContainer(modelContainer)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await SyncManager.shared.syncNow() }
            }
        }
    }

    /// vairiot://udid?value=<udid> — sent by the enrollment "done" page so the
    /// captured UDID can be stored in the Keychain and shown on the Profile screen.
    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "vairiot", url.host == "udid" else { return }
        let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "value" })?.value
        if let value, DeviceUDIDStore.save(value) {
            NotificationCenter.default.post(name: .vairiotDeviceUDIDSaved, object: nil)
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
