import Foundation
import SwiftData

/// Owns the app's single SwiftData container so view models and background
/// sync can reach the main-actor `ModelContext` without threading it through
/// every initializer.
@MainActor
final class VairiotStore {

    static let shared = VairiotStore()

    let container: ModelContainer

    var context: ModelContext { container.mainContext }

    private init() {
        let schema = Schema([CachedAsset.self, QueuedScan.self, QueuedAssetCreate.self, CachedReference.self])
        let configuration = ModelConfiguration(
            "VairiotStore",
            schema: schema,
            isStoredInMemoryOnly: false
        )
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create SwiftData container: \(error)")
        }
    }
}
