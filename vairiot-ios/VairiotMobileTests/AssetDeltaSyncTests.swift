import SwiftData
import XCTest
@testable import VairiotMobile

@MainActor
final class AssetDeltaSyncTests: XCTestCase {

    private final class MemoryStore: AssetSyncCursorStore {
        var cursor: AssetSyncCursor?
        var markedAt: Date?
        init(_ cursor: AssetSyncCursor? = nil) { self.cursor = cursor }
        func load() -> AssetSyncCursor? { cursor }
        func save(_ cursor: AssetSyncCursor) { self.cursor = cursor }
        func markSynced(at date: Date) { markedAt = date }
        var lastSyncedAt: Date? { cursor?.lastSyncedAt ?? markedAt }
    }

    private struct Call: Equatable { let since: String?; let until: String?; let page: Int }

    private var store: TestStore!
    private var calls: [Call] = []
    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    override func setUp() async throws {
        store = TestStore()
        calls = []
    }

    private func asset(_ id: String, _ name: String? = nil) -> AssetResponse {
        AssetResponse(id: id, assetNumber: "AST-\(id)", name: name ?? id, description: nil, status: "active",
                      condition: "good", serialNumber: nil, barcode: nil, rfidTag: nil,
                      category: nil, site: nil, location: nil)
    }

    private func page(_ assets: [AssetResponse], page: Int = 1, totalPages: Int = 1,
                      deletedIds: [String]? = [], serverTime: String? = "2026-10-05T10:00:00.000Z") -> AssetListResponse {
        AssetListResponse(assets: assets, total: assets.count, page: page, pageSize: 200, totalPages: totalPages,
                          deletedIds: deletedIds, serverTime: serverTime)
    }

    private func cursor(fullAgo: TimeInterval = 60) -> AssetSyncCursor {
        AssetSyncCursor(tenantId: "tenant-1", serverTime: "2026-10-05T09:00:00.000Z",
                        lastSyncedAt: now.addingTimeInterval(-60), lastFullSyncAt: now.addingTimeInterval(-fullAgo))
    }

    private func cache(_ ids: String...) {
        for id in ids { store.context.insert(CachedAsset(from: asset(id))) }
        try? store.context.save()
    }

    private var cachedIds: Set<String> { Set(store.all(CachedAsset.self).map(\.id)) }

    @discardableResult
    private func sync(_ cursorStore: MemoryStore, _ responses: Any...) async throws -> Int {
        var script = responses
        let sync = AssetDeltaSync(context: store.context, store: cursorStore, fetchPage: { since, until, page in
            self.calls.append(Call(since: since, until: until, page: page))
            let next = script.removeFirst()
            if let error = next as? Error { throw error }
            return next as! AssetListResponse
        }, now: { self.now })
        return try await sync.sync(tenantId: "tenant-1")
    }

    func testFirstSyncIsAFullSyncThatReplacesTheCache() async throws {
        cache("stale")
        let cursorStore = MemoryStore()
        let count = try await sync(cursorStore, page([asset("a"), asset("b")]))

        XCTAssertEqual(calls.single?.since, AssetDeltaSync.epoch)
        XCTAssertEqual(cachedIds, ["a", "b"])
        XCTAssertEqual(count, 2)
        XCTAssertEqual(cursorStore.cursor?.serverTime, "2026-10-05T10:00:00.000Z")
        XCTAssertEqual(cursorStore.cursor?.lastFullSyncAt, now)
    }

    func testLaterSyncsFetchOnlyChangesWithOverlap() async throws {
        cache("a", "b", "c")
        let cursorStore = MemoryStore(cursor())
        try await sync(cursorStore, page([asset("b", "B renamed")], deletedIds: ["c"]))

        XCTAssertEqual(calls.single?.since, "2026-10-05T08:58:00Z")
        XCTAssertEqual(cachedIds, ["a", "b"])
        XCTAssertEqual(store.all(CachedAsset.self).first { $0.id == "b" }?.name, "B renamed")
        XCTAssertEqual(cursorStore.cursor?.lastFullSyncAt, cursor().lastFullSyncAt)
    }

    func testLaterPagesArePinnedToServerTime() async throws {
        try await sync(MemoryStore(cursor()),
                       page([asset("a")], totalPages: 2),
                       page([asset("b")], page: 2, totalPages: 2))
        XCTAssertNil(calls[0].until)
        XCTAssertEqual(calls[1].until, "2026-10-05T10:00:00.000Z")
        XCTAssertEqual(cachedIds, ["a", "b"])
    }

    func testFullSyncAgainAfter24Hours() async throws {
        try await sync(MemoryStore(cursor(fullAgo: AssetDeltaSync.fullSyncEvery)), page([asset("a")]))
        XCTAssertEqual(calls.single?.since, AssetDeltaSync.epoch)
    }

    func testDifferentTenantStartsOver() async throws {
        cache("other-tenant")
        var other = cursor()
        other.tenantId = "tenant-2"
        try await sync(MemoryStore(other), page([asset("a")]))
        XCTAssertEqual(calls.single?.since, AssetDeltaSync.epoch)
        XCTAssertEqual(cachedIds, ["a"])
    }

    func testFullSyncKeepsProvisionalRowsForOfflineCreates() async throws {
        store.context.insert(CachedAsset(from: asset("pending-1234")))
        cache("stale")
        try await sync(MemoryStore(), page([asset("a")]))
        XCTAssertEqual(cachedIds, ["a", "pending-1234"])
    }

    func testFailureLeavesCacheAndCursorUntouched() async throws {
        cache("a")
        let before = cursor()
        let cursorStore = MemoryStore(before)
        do {
            try await sync(cursorStore, page([asset("b")], totalPages: 2), offline)
            XCTFail("expected the error to propagate")
        } catch {}
        XCTAssertEqual(cachedIds, ["a"])
        XCTAssertEqual(cursorStore.cursor, before)
    }

    func testServerWithoutDeltaSupportFallsBackToFullDownload() async throws {
        cache("stale")
        let cursorStore = MemoryStore(cursor())
        let count = try await sync(cursorStore,
                                   page([asset("a")], totalPages: 2, deletedIds: nil, serverTime: nil),
                                   page([asset("b")], page: 2, totalPages: 2, deletedIds: nil, serverTime: nil))
        XCTAssertEqual(cachedIds, ["a", "b"])
        XCTAssertEqual(calls[1], Call(since: nil, until: nil, page: 2))
        XCTAssertEqual(count, 2)
        XCTAssertEqual(cursorStore.cursor?.serverTime, cursor().serverTime, "no cursor from an old server")
        XCTAssertEqual(cursorStore.markedAt, now)
    }

    func testSyncAgeWording() {
        XCTAssertNil(formatSyncAge(nil, now: now))
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-20), now: now), "Last synced just now")
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-61), now: now), "Last synced 1 minute ago")
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-12 * 60), now: now), "Last synced 12 minutes ago")
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-90 * 60), now: now), "Last synced 1 hour ago")
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-5 * 3600), now: now), "Last synced 5 hours ago")
        XCTAssertEqual(formatSyncAge(now.addingTimeInterval(-3 * 86400), now: now), "Last synced 3 days ago")
    }
}
