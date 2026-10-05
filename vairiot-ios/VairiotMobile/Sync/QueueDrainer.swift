import Foundation
import SwiftData

/// One offline queue as seen by `drainQueue`. Built per queue over SwiftData
/// and the API call that sends a row (see `SyncQueues`); tests build it over
/// an in-memory store and a fake API.
@MainActor
struct SyncQueue<Item: PersistentModel> {
    /// Rows to try, oldest first: pending and failed, never dead.
    var nextBatch: () -> [Item]
    /// Sends the row. Throws on any failure; `classifySyncFailure` decides what happens.
    var send: (Item) async throws -> Void
    /// The server has the row (accepted now, or an earlier attempt landed). Remove it.
    var onSynced: (Item) -> Void
    var markFailed: (Item, String) -> Void
    var markDead: (Item, String) -> Void
}

enum DrainOutcome: Equatable {
    /// Every row was tried; nothing transient is left over.
    case done
    /// Offline or a transient server error; try again later.
    case retry
    /// 401: the session is gone. Stop until the user signs in again.
    case pausedAuth
}

struct DrainReport: Equatable {
    var outcome: DrainOutcome
    var synced = 0
    var failed = 0
    var dead = 0
}

/// Drains `queue` under the S0.2 rules (same as Android's `drainQueue`):
///
/// - success, or a 409 duplicate -> row removed;
/// - network error / timeout -> row failed, drain stops (the rest would fail too);
/// - 5xx / 408 / 429 -> row failed, drain continues with the next row;
/// - other 4xx (incl. 403 and non-duplicate 409) -> row dead with the server's message;
/// - 401 -> row untouched, drain stops.
///
/// Network and server errors never count as attempts and no failure deletes a
/// row. Each row is tried at most once per drain so one bad row can't starve
/// the rest. Rows are tracked by `persistentModelID`, not object identity:
/// a re-fetch can return fresh instances (and a freed instance's address can
/// be reused), which let rows be re-sent — or loop — within one drain.
@MainActor
func drainQueue<Item: PersistentModel>(_ queue: SyncQueue<Item>) async -> DrainReport {
    var report = DrainReport(outcome: .done)
    var retry = false
    var seen = Set<PersistentIdentifier>()

    while true {
        let batch = queue.nextBatch().filter { !seen.contains($0.persistentModelID) }
        if batch.isEmpty { break }
        for item in batch {
            seen.insert(item.persistentModelID)
            do {
                try await queue.send(item)
                queue.onSynced(item)
                report.synced += 1
            } catch {
                let failure = classifySyncFailure(error)
                switch failure.kind {
                case .duplicate:
                    queue.onSynced(item)
                    report.synced += 1
                case .network:
                    queue.markFailed(item, failure.message)
                    report.failed += 1
                    report.outcome = .retry
                    return report
                case .auth:
                    report.outcome = .pausedAuth
                    return report
                case .transient:
                    queue.markFailed(item, failure.message)
                    report.failed += 1
                    retry = true
                case .permanent:
                    queue.markDead(item, failure.message)
                    report.dead += 1
                }
            }
        }
    }
    report.outcome = retry ? .retry : .done
    return report
}
