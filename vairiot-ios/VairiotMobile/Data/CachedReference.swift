import Foundation
import SwiftData

/// Local cache of reference data (categories, sites, site locations) so the
/// new-asset form's pickers work offline. Refreshed whenever the online load
/// succeeds.
@Model
final class CachedReference {

    /// Composite uniqueness: "\(kind):\(refId)".
    @Attribute(.unique) var key: String
    var kind: String // "category" | "site" | "location"
    var refId: String
    var name: String
    var parentId: String? // owning siteId for locations

    init(kind: String, refId: String, name: String, parentId: String? = nil) {
        self.key = "\(kind):\(refId)"
        self.kind = kind
        self.refId = refId
        self.name = name
        self.parentId = parentId
    }
}

// MARK: - Cache helpers

@MainActor
enum ReferenceCache {

    static func store(kind: String, items: [(id: String, name: String)], parentId: String? = nil) {
        let context = VairiotStore.shared.context
        for item in items {
            let key = "\(kind):\(item.id)"
            let predicate = #Predicate<CachedReference> { $0.key == key }
            if let existing = try? context.fetch(FetchDescriptor<CachedReference>(predicate: predicate)).first {
                existing.name = item.name
                existing.parentId = parentId
            } else {
                context.insert(CachedReference(kind: kind, refId: item.id, name: item.name, parentId: parentId))
            }
        }
        try? context.save()
    }

    static func load(kind: String, parentId: String? = nil) -> [(id: String, name: String)] {
        let context = VairiotStore.shared.context
        let predicate: Predicate<CachedReference>
        if let parentId {
            predicate = #Predicate<CachedReference> { $0.kind == kind && $0.parentId == parentId }
        } else {
            predicate = #Predicate<CachedReference> { $0.kind == kind }
        }
        let descriptor = FetchDescriptor<CachedReference>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.name)]
        )
        let cached = (try? context.fetch(descriptor)) ?? []
        return cached.map { ($0.refId, $0.name) }
    }
}
