import SwiftData
import SwiftUI

struct ContentView: View {

    enum Tab: String, CaseIterable {
        case assets
        case scanner
        case audits
        case maintenance
        case profile
    }

    @State private var selectedTab: Tab = .assets

    let apiClient: APIClient
    let tokenManager: TokenManager

    var body: some View {
        TabView(selection: $selectedTab) {
            assetsTab
            scannerTab
            auditsTab
            maintenanceTab
            profileTab
        }
        .tint(.vairiotViolet)
    }

    // MARK: - Tabs

    private var assetsTab: some View {
        NavigationStack {
            AssetListView(apiClient: apiClient)
                .vairiotNavigationBar()
        }
        .tabItem {
            Label("Assets", systemImage: "archivebox")
        }
        .tag(Tab.assets)
    }

    private var scannerTab: some View {
        NavigationStack {
            ScannerTabView(apiClient: apiClient)
                .vairiotNavigationBar()
        }
        .tabItem {
            Label("Scanner", systemImage: "qrcode.viewfinder")
        }
        .tag(Tab.scanner)
    }

    private var auditsTab: some View {
        NavigationStack {
            AuditListView(apiClient: apiClient)
                .vairiotNavigationBar()
        }
        .tabItem {
            Label("Audits", systemImage: "checklist")
        }
        .tag(Tab.audits)
    }

    private var maintenanceTab: some View {
        NavigationStack {
            MaintenanceListView(apiClient: apiClient)
                .vairiotNavigationBar()
        }
        .tabItem {
            Label("Maintenance", systemImage: "wrench.and.screwdriver")
        }
        .tag(Tab.maintenance)
    }

    private var profileTab: some View {
        NavigationStack {
            ProfileView(apiClient: apiClient, tokenManager: tokenManager)
                .vairiotNavigationBar()
        }
        .tabItem {
            Label("Profile", systemImage: "person.circle")
        }
        .tag(Tab.profile)
    }
}

// MARK: - Scanner Tab View

struct ScannerTabView: View {

    let apiClient: APIClient
    @State private var showScanner = false
    @State private var lookupResult: AssetResponse?
    @State private var notFoundTag: String?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 80))
                .foregroundStyle(Color.vairiotViolet.opacity(0.6))

            Text("Scan an Asset")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Use the camera to scan a barcode or QR code on an asset tag.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button {
                showScanner = true
            } label: {
                Label("Open Scanner", systemImage: "camera")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
            .padding(.horizontal, 40)

            if isLoading {
                ProgressView("Looking up asset...")
            }

            if let tag = notFoundTag {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.title)
                        .foregroundStyle(Color.warningAmber)
                    Text("No asset found for tag:")
                        .font(.subheadline)
                    Text(tag)
                        .font(.caption)
                        .monospaced()
                        .foregroundStyle(.secondary)
                }
                .padding()
            }

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(Color.errorRed)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.vairiotWash)
        .navigationTitle("Scanner")
        .fullScreenCover(isPresented: $showScanner) {
            ScannerView(
                onBarcodeScanned: { code in
                    showScanner = false
                    Task { await lookupTag(code) }
                },
                onDismiss: { showScanner = false }
            )
        }
        .navigationDestination(item: $lookupResult) { asset in
            AssetDetailView(assetId: asset.id, apiClient: apiClient)
        }
    }

    private func lookupTag(_ tag: String) async {
        isLoading = true
        notFoundTag = nil
        errorMessage = nil
        // Network-first with offline cache fallback.
        let repository = AssetRepository(apiClient: apiClient, modelContext: VairiotStore.shared.context)
        switch await repository.lookupByTag(tag: tag) {
        case .found(let asset, _):
            lookupResult = asset
        case .notFound:
            notFoundTag = tag
        }
        isLoading = false
    }
}

extension AssetResponse: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    public static func == (lhs: AssetResponse, rhs: AssetResponse) -> Bool {
        lhs.id == rhs.id
    }
}
