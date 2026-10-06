# Vairiot — Known-Fix Registry

All bugs found and fixed during development are recorded here.
Before starting any new module, read this file and apply relevant fixes proactively.
This prevents the same problem being solved more than once.

---

## Format

Each entry contains:
- **ID** — sequential number
- **Module** — which part of the codebase was affected
- **Root Cause** — what caused the bug
- **Fix Applied** — exactly what was changed
- **Test Added** — how to confirm it never recurs

---

## KFR-001 — docx-js PageNumber constant

| Field | Detail |
|---|---|
| **Module** | Any Node.js script generating Word (.docx) documents using the `docx` npm package |
| **Root Cause** | `PageNumber` is a constant object in docx-js v8+, not a constructor. Calling `new PageNumber()` throws `TypeError: PageNumber is not a constructor`. |
| **Fix Applied** | Use `PageNumber.CURRENT` (a plain constant value) inside a `TextRun.children` array, not `new PageNumber()`. |
| **Correct usage** | `new TextRun({ children: [PageNumber.CURRENT], font: 'Montserrat', size: 16 })` |
| **Wrong usage** | `new TextRun({ children: [new PageNumber()] })` — throws at runtime |
| **Test Added** | Any document generation script must be run with `node script.js` and the output `.docx` opened in Word to confirm page numbers render. Add to CI as a smoke test once document generation is a scheduled feature. |

---

## KFR-002 — PNG transparency stripped on claude.ai upload

| Field | Detail |
|---|---|
| **Module** | Any workflow that uploads PNG logo files to claude.ai for processing |
| **Root Cause** | The claude.ai upload pipeline converts RGBA PNGs to RGB, replacing all transparent pixels with black (0,0,0). The file mode on the server reads as `RGB` not `RGBA` even though the original file on disk has `Alpha channel: Yes` (confirmed in macOS Get Info). |
| **Fix Applied** | Reconstruct transparency from the uploaded RGB copy using saturation + brightness thresholding: pure black pixels (R=G=B=0) become fully transparent (alpha=0); very dark grey pixels (max channel ≤ 20) are treated as antialiasing and get proportional alpha; all other pixels are fully opaque (alpha=255). |
| **Code pattern** | See `vairiot_v1_5.js` Python preprocessing block for the exact NumPy implementation. |
| **Applies to** | Both `Variot-full.png` and `vairiot_only.png` — and any future logo PNGs uploaded to Claude that have transparent backgrounds. |
| **Prevention** | If re-uploading logos: use the reconstructed versions `Variot-full_transparent.png` and `vairiot_only_transparent.png` generated during Sprint 0 setup, not the raw uploads. |
| **Test Added** | After reconstruction, verify with Pillow: `assert img.mode == 'RGBA'` and sample known background coordinates for alpha=0 and known logo content coordinates for alpha=255. |

---

## KFR-003 — Vairiot gradient end colour

| Field | Detail |
|---|---|
| **Module** | All brand/design token files across web, Android, and documents |
| **Root Cause** | The gradient end colour was initially assumed to be `#333399` based on the brand guide colour sample image. Pixel-sampling the actual logo files revealed the true end colour is `#615AA0` (a softer violet), not the hard purple `#333399`. |
| **Fix Applied** | Replaced `#333399` with `#615AA0` in all design token files, Tailwind config, Android `colors.xml`, `VairiotTheme.kt`, and all document generation scripts. Gradient midpoint confirmed as `#A05B97`. |
| **Correct gradient** | `linear-gradient(90deg, #FF0DCC 0%, #A05B97 50%, #615AA0 100%)` |
| **Wrong gradient** | `linear-gradient(90deg, #FF0DCC 0%, #333399 100%)` |
| **Test Added** | All design token files now include a comment referencing the pixel-sampling source. Any PR touching brand colours must be reviewed against the logo files `Variot-full.png` and `vairiot_only.png`. |

---

*Last updated: Sprint 1, June 2026*
*Add new entries above this line in the same format.*

## KFR-004 — Docker socket on newer Docker Desktop for Mac
Run once: `sudo ln -sf /Users/marchecentral1/.docker/run/docker.sock /var/run/docker.sock`
Re-apply after Mac restart. Test: `docker ps` works without error.

## KFR-005 — Sprint files: use shell scripts not zip files
Zip downloads via claude.ai are unreliable. All sprints delivered as heredoc shell scripts pasted directly into Terminal.

## KFR-006 — Android offline queue: transient failures parked as dead

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile `sync/` (ScanSyncWorker, AssetSyncWorker) |
| **Root Cause** | 5xx responses counted as attempts and a row was parked after 5, so a server outage of a few hours turned good field scans into "failed" items. The queue had only `pending`/`dead` states, so there was no way to say "tried, will retry". |
| **Fix Applied** | Added `QueueState.FAILED`. All three workers now share `drainQueue()` (`sync/QueueDrainer.kt`). Network errors, timeouts, 5xx, 408 and 429 set FAILED with `lastError` and never count as attempts. Other 4xx set DEAD with the server's message. 401 leaves the row alone and pauses the worker. No failure path deletes a row. |
| **Test Added** | `QueueDrainerTest` (13 cases, including "no failure of any kind deletes a row" and "transient failures never turn into dead rows"). Run `cd vairiot-mobile && ./gradlew testDebugUnitTest`. |

## KFR-007 — HTTP 409 is not "already synced" on Vairiot routes

| Field | Detail |
|---|---|
| **Module** | Any client queue that replays requests to vairiot-api |
| **Root Cause** | A common offline rule is "409 = the record exists = success". On Vairiot the API returns **201 with the original record** for a replayed `clientRequestId`, and uses 409 for real rejections (`CAMPAIGN_NOT_ACTIVE`, `ZONE_LOCKED`, `ALREADY_DISPOSED`). Treating 409 as success would delete a scan the server never stored, for example when the campaign was completed while the device was offline. |
| **Fix Applied** | `classifySyncFailure()` treats a 409 as success only when its `code` is `DUPLICATE_REQUEST`. Every other 409 becomes DEAD with its message, visible under Profile → Pending uploads. |
| **Test Added** | `SyncFailureTest` "409 is only success when it says the record already exists"; `QueueDrainerTest` "403 and non-duplicate 409 are rejections". Apply the same rule in the iOS SyncManager (S0.3). |

## KFR-008 — Duplicate records after a timed-out online request

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile AuditRunViewModel, AssetScanViewModel, ScanSessionRepository |
| **Root Cause** | Only queued replays sent `clientRequestId`. The first, online attempt sent none. If the server stored the record but the response timed out, the queued retry carried a new key, and the server created a second asset or counted a second scan. |
| **Fix Applied** | The key is created once, before the first attempt, and reused if the request is queued. Audit scans go through `AuditScanRecorder`, which writes the queue row first and sends that row's key and `capturedAt`. Asset creates build a `QueuedAsset` first and send `queued.toRequest()`. |
| **Test Added** | `AuditScanRecorderTest` "a timeout after the server stored the scan replays with the same key" and "offline blind scan keeps zone, condition, capture time and key"; `AssetAndPhotoQueueTest` "asset replay sends the key generated when it was queued". |

## KFR-009 — Android photos taken offline were discarded

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile AssetPhotosViewModel |
| **Root Cause** | A failed upload showed "Upload failed" and kept nothing, so a photo taken with no signal was lost. |
| **Fix Applied** | New `QueuedPhoto` table (Room v7, `MIGRATION_6_7`), `QueuedPhotoDao`, `PhotoSyncWorker` and `PhotoSyncScheduler`. The compressed files already sit in `filesDir/photos`. The row is written before the upload starts, and files are deleted only after the server accepts them or the user discards a DEAD row. Photos of an asset created offline wait for that asset to sync (`attachToAsset`). Pending photos count toward the two-photo limit and are shown on the asset. |
| **Test Added** | `AssetAndPhotoQueueTest` (photo upload, offline, rejection, missing file, waiting for an offline asset). Maintenance photos still upload online-only (follow-up). |

## KFR-010 — Rejected audit scans reported as "Queued offline"

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile AuditRunViewModel |
| **Root Cause** | The online scan path caught every exception and showed "Queued offline", including a 400 or 409 the server would never accept. Users believed rejected scans were saved. |
| **Fix Applied** | `AuditScanRecorder.Outcome.Rejected` shows "Scan not accepted: <server message>" and keeps the row as DEAD for retry or discard. |
| **Test Added** | `AuditScanRecorderTest` "server rejection is kept as dead with the reason, not reported as queued". |

## KFR-011 — Room destructive-migration fallback could wipe offline queues

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile `di/DatabaseModule.kt` |
| **Root Cause** | `fallbackToDestructiveMigration()` meant that any future schema bump without a matching `Migration` would silently drop every table, queued field work included, on the next app update. |
| **Fix Applied** | Replaced with `fallbackToDestructiveMigrationFrom(true, 1, 2, 3)`: only pre-v4 builds (before the queues had idempotency keys) may rebuild. A missing migration from v4 onwards now crashes at open, which a release smoke test catches before field devices do. **Every Room version bump needs a `Migration`.** |
| **Test Added** | None automated (needs an instrumented `MigrationTestHelper` test). Before each release, install the previous APK, queue work offline, upgrade, and confirm the queue survives. |

## KFR-012 — Android cleared the session on a refresh 403

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile `di/NetworkModule.kt` |
| **Root Cause** | Tokens were cleared on a refresh 401 **or 403**. The refresh endpoint signals a dead session only with 401 (`auth.service.ts`). A 403 from a proxy or WAF signed the user out in the field, and their queue stopped draining until they signed in again. |
| **Fix Applied** | Clear only on 401. Workers that hit a 401 now pause (return success, not retry) instead of spinning on backoff. `TokenStore.signedIn` triggers every queue on launch and on each sign-in (`VairiotApp`). |
| **Test Added** | `QueueDrainerTest` "401 pauses without touching the row"; `AuditScanRecorderTest` "signed-out scan stays pending". |

## KFR-013 — iOS offline queue: same silent-loss rules as Android had

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `Data/SyncManager.swift`, queue models |
| **Root Cause** | 5xx and other 4xx both counted toward a 5-attempt limit and then parked the row, so a server outage could park good scans. 403 stopped the whole drain instead of parking the one row. Only a `dead` flag existed. |
| **Fix Applied** | Same model and rules as Android (KFR-006/007): a `state` column (`pending`/`failed`/`dead`) on `QueuedScan` and `QueuedAssetCreate`, and a shared `drainQueue()` (`Sync/QueueDrainer.swift`). Rows parked under the old `dead` flag are carried over on launch by `QueueState.migrateLegacyFlags`. iOS has no WorkManager, so `SyncManager.syncSoon()` retries transient failures in the foreground with backoff (30 s doubling to 15 min); reconnecting already triggers a sync. |
| **Test Added** | `QueueDrainerTests` (12) and `SyncFailureTests` (8) in the new `VairiotMobileTests` target. Run `xcodebuild -scheme VairiotMobile -destination 'platform=iOS Simulator,name=iPhone 17' test`. Upgrade verified on the simulator: an old-schema store with a parked and a pending scan opened under the new build with `dead`/`pending` states and no crash. |

## KFR-014 — iOS blind audits rejected online and offline

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `Screens/Audits/AuditRunViewModel.swift`, `AuditRunView.swift` |
| **Root Cause** | iOS sent only `tagValue`. The API requires `locationId` on every blind-campaign scan (`audit.service.ts`), so every iOS blind scan was rejected. Offline ones were queued without a zone and could never sync. The zone field was free text used only for zone submission. Blind results (`"recorded"`) were shown as "Unknown Tag". No condition could be recorded. |
| **Fix Applied** | A zone picker from the site's locations (falling back to `ReferenceCache` when offline), required and checked against locked zones before scanning. An optional condition picker. Scans go through `AuditScanRecorder` (write-ahead, one key for the online try and the replay). "Recorded" result shown. Zone submission shown only for blind campaigns (the API rejects it for others). A pending-scan count on the screen. |
| **Test Added** | `AuditScanRecorderTests` (5): blind scan carries zone, condition and key; offline replay identical; rejection kept as dead; signed-out scan stays pending. |

## KFR-015 — iOS signed users out on refresh 5xx/403; photo uploads never refreshed

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `API/APIClient.swift` |
| **Root Cause** | Any refresh failure except a dropped connection called `tokenManager.clear()`, including 5xx, a proxy 403 or an unreadable response. Separately, `upload()` had no 401 refresh path, so a photo upload with an expired access token failed, and a queued photo would pause forever. |
| **Fix Applied** | `refreshAfter401()` clears the session only when the refresh endpoint answers 401. Both `performRequest` and `upload` use it and retry once. |
| **Test Added** | Covered indirectly by `SyncFailureTests` (401 = pause). Refresh behaviour needs a URLProtocol-stubbed test (follow-up). |

## KFR-016 — iOS lost the server's reason for every 4xx

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `API/APIClient.swift` |
| **Root Cause** | Every non-401/403/404 status, 4xx and 5xx alike, became `APIError.serverError(Int)` and the body was discarded. The app could not tell a rejection from a hiccup, or a duplicate 409 from a "campaign closed" 409, and the user saw "Server error (409)". |
| **Fix Applied** | New `APIError.rejected(status:message:code:)` for other 4xx, decoded from the API's `{"error","code"}` body. `serverError` now means 5xx only. Existing `catch let error as APIError` sites are unchanged and now show the server's message. |
| **Test Added** | `SyncFailureTests`: 409 classification by code, message preserved. |

## KFR-017 — Drain re-sent rows within one run (SwiftData object identity)

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `Sync/QueueDrainer.swift` |
| **Root Cause** | The "each row once per drain" guard keyed on `ObjectIdentifier`. A SwiftData re-fetch can return fresh instances, and a freed instance's address can be reused, so already-tried rows looked new. Rows were re-sent within a run (6 sends for 3 rows), and failing rows could loop. Found because the test was intermittent. |
| **Fix Applied** | Key on `persistentModelID` (`SyncQueue<Item: PersistentModel>`). **Never use `ObjectIdentifier` to track SwiftData models across fetches.** |
| **Test Added** | `QueueDrainerTests.testEachRowIsTriedOncePerDrain`, run 50 times in a row with `-test-iterations 50`, all passing. |

## KFR-018 — iOS offline photos lost; no background sync; online creates without a key

| Field | Detail |
|---|---|
| **Module** | vairiot-ios `AssetPhotosView.swift`, `AssetEditViewModel.swift`, `App/VairiotApp.swift` |
| **Root Cause** | A failed photo upload showed "Failed to upload photo" and kept nothing. Queues drained only in the foreground, so work captured offline waited until the app was reopened. Online asset creates sent no `clientRequestId`, so a timeout followed by a retry created a duplicate. |
| **Fix Applied** | `QueuedPhoto` model plus `PhotoFileStore` (files in Application Support/QueuedPhotos, stored by name not path, excluded from backup). The photo is written before upload; photos of offline-created assets follow their asset. `BGProcessingTask` `com.vairiot.mobile.sync` (requires network) is registered in `VairiotApp.init` and scheduled when the app backgrounds with work queued (`Sync/BackgroundSync.swift`; Info.plist keys come from `project.yml`). Every queue drains on each sign-in. The asset form uses one key per form for every try and the queued row. Profile → Pending uploads shows counts by state, with per-row Retry and confirmed Discard. |
| **Test Added** | `AssetAndPhotoQueueTests` (7). Background execution cannot run in the simulator; to test it on a device, use Xcode's `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.vairiot.mobile.sync"]`. |

## KFR-019 — Scanner fleets behind one NAT throttled by the per-IP limit

| Field | Detail |
|---|---|
| **Module** | vairiot-api `middleware/rate-limit.ts`, `app.ts` |
| **Root Cause** | Every request counted against one global 100/min limit keyed by client IP. A depot of handhelds flushing offline queues shares one public IP, so a single reconnect throttled the whole fleet and turned queued work into retries. |
| **Fix Applied** | `isSyncRequest()` matches the sync routes (POST `/assets`, `/audits/:id/scans`, `/scan-sessions`, asset and maintenance photo uploads). The global limiter skips them. `syncLimiter` (600/min, `RATE_LIMIT_SYNC_PER_MIN`) runs after `authenticate`, keyed by tenant and user, in Redis. Login lockout was already in Postgres and the other limiters already in Redis, so all of them hold across replicas. |
| **Test Added** | `__tests__/sync/sync-hardening.test.ts` (per-user budget behind one IP, route matching) and `__tests__/sync/replicas.test.ts` (six failed logins across two app instances lock the account on both; two instances share one Redis-backed sync budget). |

## KFR-020 — Replay of an existing asset refused at the licence cap

| Field | Detail |
|---|---|
| **Module** | vairiot-api `routes/assets/assets.router.ts` |
| **Root Cause** | `enforceAssetCap()` ran before the `clientRequestId` lookup. A tenant at its cap whose device replayed a create the server already had got a 403, and the device parked a record the server actually holds. Duplicates also returned 201, the same as a real create. |
| **Fix Applied** | The route looks up the key first and returns the existing asset with **200** before the cap check. `createAssetIdempotent()` reports `created`, so a race between two requests with the same key also answers 200. Duplicate scans (`POST /audits/:id/scans`) also return 200. Clients treat any 2xx as success. |
| **Test Added** | `sync-hardening.test.ts`: "returns the existing asset even when the tenant is at its asset cap"; 200 on duplicate asset and scan. |

## KFR-021 — Public iOS enrolment trusted unsigned, unbounded input (SEC-H2)

| Field | Detail |
|---|---|
| **Module** | vairiot-api `routes/ios/ios.router.ts`, new `lib/ios-enrolment.ts` |
| **Root Cause** | `/api/v1/ios/udid/callback` regex-matched attributes out of the raw body without verifying the PKCS#7 signature. It accepted 2 MB bodies with no limit on field length, had no rate limit beyond the global one, and its upsert let anyone rewrite an already-registered device's details. |
| **Fix Applied** | `openssl cms -verify` against `IOS_UDID_CA_FILE`; when that is set, unverified payloads get a 400 and attributes are read only from the verified content. When it isn't set, enrolment works as before but the device is stored with the new `signatureVerified = false`. UDID, product, OS build and serial must match Apple's formats. Body limit is 128 KB; `enrolmentLimiter` allows 10 per 15 min per IP. An unverified payload never updates a registered or previously verified device. APK/IPA downloads get `appDownloadLimiter` (60 per 15 min, SEC-L1). |
| **Test Added** | `__tests__/ios/ios-enrolment.test.ts` (12). It builds a throwaway CA and a device certificate with openssl and signs real CMS payloads, then checks that a trusted signature verifies and that rogue-CA, unsigned and tampered payloads are refused. It also covers format checks and registered-device protection. **Switching it on in production requires a real-iPhone check: see DEPLOY.md.** |

## KFR-022 — `npm test` could run destructive tests against any database

| Field | Detail |
|---|---|
| **Module** | vairiot-api `jest.setup.ts` |
| **Root Cause** | The integration suite (including tenant-delete tests) ran against whatever `DATABASE_URL` was in `.env`. It hit staging once (2 Sep 2026) and the local dev database during the S0.1 baseline. |
| **Fix Applied** | The tests refuse to start unless the database is on localhost/127.0.0.1/::1 **and** its name ends in `_test` (what `scripts/test-api.sh` and CI use). Override deliberately with `ALLOW_ANY_TEST_DATABASE=1`. |
| **Test Added** | Verified manually: `npx jest` with the dev `.env` stops with "Refusing to run the API tests against database "vairiot_dev"". |

## KFR-023 — Asset cache wiped on refresh (Android partial wipe; iOS lost offline creates)

| Field | Detail |
|---|---|
| **Module** | vairiot-mobile `data/AssetRepository.kt`; vairiot-ios `Data/AssetRepository.swift` |
| **Root Cause** | Android replaced the whole cache after page 1 and then upserted later pages. A connection drop mid-sync left a partial register while reporting failure. iOS deleted *every* cached asset on a full refresh, including the provisional `pending-…` rows for assets created offline, so they vanished from the list until synced. Both downloaded the full register on every refresh. |
| **Fix Applied** | `AssetDeltaSync` on both platforms, using `GET /assets?changedSince=`. It fetches every page before touching the cache and saves the cursor last. iOS full syncs keep `pending-…` rows. A full sync runs on first use, on a tenant switch, or every 24 h; otherwise it's a delta with a 2-minute overlap, with later pages pinned by `changedUntil`. It falls back to the old full download if the server lacks delta support. The asset lists show "Last synced X minutes ago". |
| **Test Added** | Android `AssetDeltaSyncTest` (8), iOS `AssetDeltaSyncTests` (9), API delta tests in `sync-hardening.test.ts` (including paging stability when an asset is edited mid-sync). |

## KFR-024 — OpenAPI said the asset list was `data`; the API returns `assets`

| Field | Detail |
|---|---|
| **Module** | vairiot-api `lib/openapi.ts` |
| **Root Cause** | The `AssetList` schema named the array `data` (and omitted `totalPages`), so generated clients would decode nothing. |
| **Fix Applied** | Corrected it, and documented `changedSince`/`changedUntil`, the `AssetChanges` response, 200 responses for duplicates, the 409 meanings and 429. |
| **Test Added** | None. Consider validating responses against the spec in tests. |

## KFR-025 — API tests talked to other apps on macOS (random 401/405/"socket hang up")

| Field | Detail |
|---|---|
| **Module** | vairiot-api test harness (`jest.setup.ts`; supertest) |
| **Root Cause** | For `request(app)`, supertest creates a server, calls `listen(0)` (a wildcard `::` bind on a random port) and then connects to `127.0.0.1:<port>`. On macOS (BSD sockets) a wildcard bind may share a port with another process's more specific `127.0.0.1` bind, and loopback connections then go to that process. This Mac has several such listeners in the ephemeral range (Adobe Creative Cloud, a Java process, Docker's forwards for the test Postgres and Redis). A full run makes about 1,000 supertest requests, so roughly 1 run in 11 sent a request to another app. Symptoms: RBAC logins with no token (then 401), `405 MethodNotAllowed` from Creative Cloud, or "socket hang up", sometimes failing whole files. Linux refuses the overlapping bind, so CI never saw it. Reproduced directly: Node bound `::59661` alongside Creative Cloud's `127.0.0.1:59661`, and a request to 127.0.0.1 got Creative Cloud's 405. |
| **Fix Applied** | `jest.setup.ts` patches supertest's `Test#serverAddress`/`Test#end`. The bind is deferred to `end()` and done on `127.0.0.1` (an asynchronous bind, which supertest's synchronous constructor can't do), so the kernel refuses a port someone else holds. It covers every `request(app)` with no test changes. Patching `http.Server#listen` doesn't work: binding to a host is asynchronous, and supertest reads the port immediately. |
| **Test Added** | `src/__tests__/test-server-binding.test.ts` asserts, through a real supertest request, that the server listens on `127.0.0.1`. It fails without the fix (`::`). Evidence: before the fix, 8 of ~88 local full runs got a wrong-server failure (~9%); after it, 40 of 40 passed (about 2% likely by chance at the old rate). |
| **Also seen** | Before the fix, about 1 run in 8 crashed: the Jest process segfaulted inside V8's garbage collector (`ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`, Node v24.15.0 arm64, with or without Maglev; 8 crashes in ~65 runs). None occurred in the 40 runs after the fix (under 1% likely at the old rate), so the crash appears to be triggered by the wrong-server error paths. That's a runtime bug, not app code, and the link isn't proven. If it returns, capture the `~/Library/Logs/DiagnosticReports/node-*.ips` report and try a newer Node 24 patch release. |

## KFR-026 — Backups: placeholder key left unencrypted archives; no Redis; silent bucket skips

| Field | Detail |
|---|---|
| **Module** | `infra/backup.sh`, `infra/backup.crontab`, `infra/restore.sh` |
| **Root Cause** | The crontab passed `BACKUP_AGE_RECIPIENT=age1REPLACE_ME`, so unless `.env` overrode it `age` failed. The script then exited with the **unencrypted** archive (containing `.env`) on disk and nothing uploaded. A bucket whose mirror failed was skipped silently (`|| true`). Redis was not backed up. Retention was a flat 14 days. |
| **Fix Applied** | All settings live in `.env`; the crontab holds none. The archive is streamed straight into `age`. Without a recipient it is kept locally (mode 600), never sent off-host, and the run exits **2** with `[BACKUP-INCOMPLETE]`. A failed bucket mirror fails the run. Redis RDB via `BGSAVE`. Native S3 settings (`BACKUP_S3_*`, credentials via environment so they never show in `ps`), with `BACKUP_REMOTE_TARGET` still supported. 30 daily + 12 monthly off-host. A manifest records row and object counts before and after the dump. `restore.sh` can restore Redis (`RESTORE_REDIS=yes`). |
| **Test Added** | End to end in throwaway containers (real Postgres schema with 58 tables, MinIO, Redis, a second MinIO as off-site S3, runner with age and rclone): unencrypted → exit 2, local only; encrypted → daily and monthly off-host; second run → no extra monthly; planted aged copies → exactly the expired ones pruned. ShellCheck clean at style level. |

## KFR-027 — No proof backups could be restored

| Field | Detail |
|---|---|
| **Module** | new `infra/restore-test.sh`, `infra/docker-compose.restoretest.yml` |
| **Root Cause** | Nothing ever restored a backup, so a corrupt or partial archive would only be discovered during a disaster. |
| **Fix Applied** | `restore-test.sh` fetches the newest off-host backup (or the newest local one), decrypts it and restores it into the isolated compose project `vairiot-restoretest`. It checks `prisma migrate status` (pending = warning, failed or drift = failure), row counts per table against the manifest, file counts per bucket and that the Redis snapshot loads, then tears down. Run monthly (DEPLOY.md). **Bug caught while testing it:** `docker compose exec` inside a `while read` loop swallowed the loop's input, so only the first table was compared ("1 tables match"). It now uses `</dev/null`, and a manifest with no tables fails. |
| **Test Added** | Pass from off-site and from local; a manifest claiming 30 tenants vs 25 restored → `✗ tenants … [RESTORE-TEST-FAILED]`; a truncated archive → `decryption/unpack failed`; a backup missing the newest migration → warning and pass. |

## KFR-028 — Deploys could half-apply; nothing waited for health; certbot never reloaded nginx

| Field | Detail |
|---|---|
| **Module** | `infra/deploy.sh`, new `infra/certbot/reload-nginx.sh`, `infra/docker-compose.prod.yml` |
| **Root Cause** | `deploy.sh` ran `up -d --build` and reported success without checking anything; a failed migration surfaced only as an API that wouldn't start. web and admin had no healthcheck. The certbot renewal hook existed only as a comment, so renewed certificates weren't served until a restart. |
| **Fix Applied** | Build, then migrations as their own step (`run --rm migrate`): a failure stops the deploy before anything is restarted. Then `up -d`, a wait for every long-running container to be healthy (logs printed on timeout), and `/health/ready` from inside the api. It doesn't use `up --wait`, whose handling of one-shot containers has varied between Compose releases. Installs the certbot hook. web/admin healthchecks. Log rotation 5 × 20 MB. |
| **Test Added** | The health-wait loop, extracted from `deploy.sh`, against a test compose project: healthy → pass; an unhealthy container → its logs and `DEPLOY FAILED … (running/unhealthy)`. `docker compose config` validates. |

## KFR-029 — Background jobs failing for good went unnoticed

| Field | Detail |
|---|---|
| **Module** | `vairiot-worker` (`job-alerts.ts`, `index.ts`) |
| **Root Cause** | A job that used all its retries was reported only to Sentry, and only if `SENTRY_DSN` was set. Otherwise it disappeared from BullMQ's capped failed list. |
| **Fix Applied** | `JobFailureAlerter` emails `OPS_ALERT_EMAIL`, throttled to one email per queue per 15 min with a count of held-back failures, and no job data (PII). A mail failure is logged, not looped. Browser error tracking added to web (`VITE_SENTRY_DSN`, SDK lazy-loaded; verified it is absent from the entry bundle). The worker gained a Jest setup, and CI now runs the worker, shared and web unit tests (previously none ran). |
| **Test Added** | `vairiot-worker/src/__tests__/job-alerts.test.ts` (5), `vairiot-web/src/__tests__/monitoring.test.ts` (2). |

## KFR-030 — MinIO image can no longer be pulled

| Field | Detail |
|---|---|
| **Module** | `infra/docker-compose*.yml` (object storage) |
| **Root Cause** | MinIO stopped publishing community images in 2025. `minio/minio` on Docker Hub (every tag tried, including the pinned one) and `quay.io/minio/minio` no longer resolve. Production starts only because the image is cached on the server. |
| **Fix Applied** | Built from source: `infra/minio/Dockerfile` compiles the MinIO server and `mc` from GitHub release tags with the upstream Makefile's flags. Each tag is pinned to its commit, and the build fails if a tag moves. Alpine runtime with `curl`; `minio` as the entrypoint, like the old image. Upgraded to `RELEASE.2025-10-15T17-29-55Z`, MinIO's security release for GHSA-jjjj-jwhf-8rgr (privilege escalation via session-policy bypass in service accounts/STS), which production's 2025-09-07 version is affected by. Prod, dev and infra compose files build it (`pull_policy: build`, so a Docker Hub image of the same name is never pulled). CI builds it and publishes `vairiot-minio` to GHCR on main. |
| **Test Added** | Upgrade path: objects written by the 2025-09-07 image (production's version) were read back byte-identical by the new build on the same volume, new writes worked, and the `curl` healthcheck returned 200. The full backup → off-site → restore-test cycle passes with the new image as the source store. |

## KFR-031 — pandas reads "n/a", "NA", "null", "None" as blank

| Field | Detail |
|---|---|
| **Module** | Any Python that reads registers with pandas (`scripts/profile-register.py`; the S2 importer) |
| **Root Cause** | `pd.read_excel`/`read_csv` treat a default list of strings (`n/a`, `NA`, `N/A`, `null`, `None`, `nan`, `-`…) as missing. A cost cell saying "n/a" became blank and the "cost is not a number" check missed it. An importer would silently import nothing where the register says something. |
| **Fix Applied** | Read with `keep_default_na=False` (and `dtype=object`/`str`), then decide what is blank yourself. **Do this in every pandas reader of user data.** |
| **Test Added** | `scripts/tests/test_profile_register.py::SampleRegister.test_costs_that_are_not_numbers` (the planted "n/a" on row 18). |

## KFR-032 — Services called from scripts need a real user id as the actor

| Field | Detail |
|---|---|
| **Module** | Seeds and scripts calling `vairiot-api` services (e.g. `activateLicence` from `prisma/seed-tuda.ts`) |
| **Root Cause** | Services write audit events whose `actorId` is a foreign key to `users`. The first TUDA seed passed `'seed:tuda'` as the actor, so the `licence_activated` audit event failed the FK. The failure is logged and swallowed, so the licence activation left no audit trail. |
| **Fix Applied** | The seed creates the first administrator before activating the licence and passes that user's id. Non-FK fields (`paymentConfirmedBy`, `grantedBy`) still say `seed:tuda`. |
| **Test Added** | Verified by running `npm run seed:tuda` against a throwaway database: no FK error, and `audit_events` has `licence_activated` with an actor. |

## KFR-033 — The API ran with the MinIO root credentials (SEC-M3)

| Field | Detail |
|---|---|
| **Module** | `infra/docker-compose.prod.yml`, new `infra/minio/init.sh`, `vairiot-api/src/index.ts`, `infra/deploy.sh` |
| **Root Cause** | `minio.ts` preferred `MINIO_ACCESS_KEY`, but nothing created such a user, so the API connected as root. The root credentials were in the API container's environment either way, so a compromised API owned the whole object store, including its users and policies. |
| **Fix Applied** | A one-shot `minio-init` service (same self-built image, uses `mc`) runs on every deploy. It creates the buckets and the `vairiot-app` policy (`ListBucket`/`GetBucketLocation`/`CreateBucket` on the three app buckets; `Get`/`Put`/`DeleteObject` and multipart on their objects), then creates or updates the app user and attaches the policy. The API waits for it. The API receives **only** the credentials it uses (`MINIO_ACCESS_KEY:-${MINIO_ROOT_USER}`), so with the app user set the root password never reaches the container. Without it, the API and `deploy.sh` warn. |
| **Test Added** | Against the real self-built MinIO: the init ran twice idempotently and rejected a root-named or short key. The scoped user could put/get/list/delete in app buckets, but couldn't create other buckets, read a private bucket (which is also hidden from its bucket list) or use any admin call. The API's own `minio.ts` calls (`ensure*Bucket`, put/get/list/remove) all worked as the scoped user. `docker compose config` rendered no root variables in the API in either mode. |

## KFR-034 — nginx cut off slow reports at 60 s; no server timeouts (COM-3)

| Field | Detail |
|---|---|
| **Module** | `infra/nginx/*.conf`, `standalone.conf.template`, new `vairiot-api/src/lib/server-timeouts.ts` |
| **Root Cause** | No timeouts were set anywhere. nginx's default 60 s `proxy_read_timeout` equals the 60 s report export waits on the reports service, so a slow report returned 504 while the API was still working. Tenant deletion (up to 120 s) would always have hit it. The API had no header timeout tuned for slow-request attacks. |
| **Fix Applied** | nginx: 5 s connect (fail fast when the API is down), 120 s send/read, 15 s client header, 60 s client body/send. The admin `/api/` gets 300 s. On the shared staging host the settings sit inside each Vairiot `server` block, so other sites on that nginx are untouched. API: `headersTimeout` 30 s and `requestTimeout` 330 s (above nginx's longest). `keepalive_timeout` is left to the image (setting it again is a duplicate-directive error). |
| **Test Added** | `nginx -t` passes for prod, staging, shared-host and the rendered standalone template. Behaviour test: a fake API answering in 65 s gave **504 after 60.08 s** with the old `prod.conf` and **200 after 65.03 s** with the new one, side by side. `src/__tests__/server-timeouts.test.ts`: a client that never finishes its headers gets `408`. |

## KFR-035 — A missing or short APP_ENCRYPTION_KEY only failed at first use (SEC-M6, partly)

| Field | Detail |
|---|---|
| **Module** | `vairiot-api/src/lib/crypto.ts` + `index.ts`, `vairiot-worker/src/crypto.ts` + `index.ts`, `DEPLOY.md` |
| **Root Cause** | The key was read lazily, so a server deployed without it started normally and then failed on the first 2FA set-up or mail send. It was also undocumented. |
| **Fix Applied** | The minimum is now 32 characters (was 16, with a warning under 32); raising it does not change the derived key, so existing data stays readable as long as the key itself is kept. In production the API and worker check the key at startup (`assertEncryptionKey()`), so `deploy.sh`'s health wait fails the deploy. DEPLOY.md, `.env.example` and `infra/.env.prod.example` document it: required, 32+ characters, how to generate it, never change it. The prod template also gained `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` and the backup variables. **Still open:** the static scrypt salt stays; changing it needs a re-encryption migration. |
| **Test Added** | `vairiot-api/src/__tests__/crypto-key.test.ts`: missing and 31-character keys refused, 32-character key accepted, encrypt/decrypt round trip. |

## KFR-036 — minio-init failed on staging with a misleading MinIO error

| Field | Detail |
|---|---|
| **Module** | `infra/minio/init.sh` |
| **Root Cause** | Staging already had a MinIO access key (service account) named `vairiot-app`, created by hand. `mc admin user add` with that name fails with "Credential is not allowed to be same as admin access key", although `MINIO_ACCESS_KEY` differed from `MINIO_ROOT_USER`. The deploy stopped with the API not started. |
| **Fix Applied** | Staging now uses `MINIO_ACCESS_KEY=vairiot-api`. `init.sh` checks for an access key with the chosen name first and exits with a clear message naming the clash. |
| **Test Added** | `init.sh` against the self-built MinIO: new user, rerun (idempotent) and an existing same-named access key (clear error, exit 1). |

*Last updated: S0 staging deploy, October 2026*
