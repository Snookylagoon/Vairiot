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

*Last updated: S0.2, October 2026*
