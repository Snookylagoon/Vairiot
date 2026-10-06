import Foundation
import SwiftData

/// Lifecycle of a row in any offline queue (scans, asset creates, photos).
/// A row is deleted only once the server has accepted it, or when the user
/// discards a dead row. Failures never delete. Same values as Android.
enum QueueState {
    /// Not tried yet.
    static let pending = "pending"
    /// Tried and hit a transient problem (offline, timeout, 5xx). Retried automatically.
    static let failed = "failed"
    /// The server rejected it outright. Kept for the user to retry or discard.
    static let dead = "dead"

    /// Carries rows parked by the pre-S0.3 `dead` flag over to `state`. A
    /// lightweight migration can add the `state` column but can't fill it from
    /// another column, so this runs once per launch (and is a no-op after).
    @MainActor
    static func migrateLegacyFlags(in context: ModelContext) {
        let deadState = dead
        let scans = (try? context.fetch(FetchDescriptor<QueuedScan>(
            predicate: #Predicate { $0.dead && $0.state != deadState }))) ?? []
        for scan in scans { scan.state = dead; scan.dead = false }
        let creates = (try? context.fetch(FetchDescriptor<QueuedAssetCreate>(
            predicate: #Predicate { $0.dead && $0.state != deadState }))) ?? []
        for create in creates { create.state = dead; create.dead = false }
        if !scans.isEmpty || !creates.isEmpty { try? context.save() }
    }
}
