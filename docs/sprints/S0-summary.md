# Sprint S0 — Hardening and hosting: summary

**Branch:** `feature/s0-hardening` (from `dev` at `16df41e`) · **Closed:** 6 October 2026 · **Feeds:** TOR Deliverable D1

**Goal:** field crews can trust the apps, production can be restored, and TUDA has its own environment.

**Outcome:**
- **No more silent loss of offline work.** Neither app silently loses offline work any more, and iOS blind audits, which were rejected every time, now work.
- **Backups are complete and restorable.** They cover everything, are encrypted, go off-site, and are proven restorable by a test that has been shown to fail when it should.
- **Deploys stop safely.** A failed migration halts a deploy before anything restarts.
- **TUDA can be installed.** Its tenant, a standalone server stack and a register profiler exist.
- **Two latent risks fixed.** The object-store image could no longer be downloaded, and the API test suite was flaky on macOS. Both were found and fixed along the way.

## Commits

| Commit | What |
|---|---|
| `429f7b4` | S0.1 — audit triage (`docs/sprints/S0-audit-triage.md`) and baseline |
| `0afbb4c` | S0.2 — Android offline queue never loses field work |
| `56f4ae0` | S0.3 — iOS offline parity; iOS blind audits fixed |
| `9b193d8` | S0.4 — server sync hardening, delta sync, iOS enrolment checks |
| `e28eba2` | Flaky API tests on macOS (supertest bound to the wrong address) |
| `412145c` | S0.5 — encrypted off-site backups, restore test, safe deploys, alerts |
| `d68f8dd` | MinIO built from source; 2025-10-15 security release |
| `c51b080` | S0.6 — TUDA tenant, standalone install, legacy register profiler |

## What changed

### Field apps: offline work is never lost (S0.2, S0.3)
- **One queue model on both platforms.** Each queued item is waiting, retrying (offline, timeout, 5xx; never counts as an attempt) or rejected (4xx, with the server's reason). A failure never deletes an item. A 409 counts as success only when it says the record already exists, because the API's real 409s ("campaign closed", "zone locked") are rejections.
- **Same key online and offline.** Online calls send the same idempotency key as the queued copy, so a timed-out request can't create a duplicate.
- **Photos taken offline survive** and upload later on both platforms, including photos of an asset created offline.
- **iOS:**
  - background sync (`BGProcessingTask`)
  - foreground retry with backoff
  - sign-out only on a genuine refresh 401
  - photo uploads refresh the token
  - 4xx errors now carry the server's message
- **iOS blind audits** now send the zone, from a picker that works offline, and the condition. They were rejected 100% of the time before.
- **Profile → Pending uploads** on both apps: counts by state, Retry, and confirmed Discard.
- **Android:** the destructive Room fallback is removed (migration 6 → 7), and rejected scans are no longer reported as "Queued offline".

### Server (S0.4)
- **Rate limits for scanner fleets.** Sync routes have a per-user limit (600/min, Redis) instead of the 100/min per-IP limit that throttled scanners behind one NAT. Limits and login lockout hold across API replicas, and a test proves it.
- **Compression:** gzip on API responses.
- **Delta sync:** `GET /assets?changedSince=` returns changed assets, deletions and `serverTime`, with stable paging. Both apps use it with a daily full sync, and show "Last synced X ago". The cache is untouched until a sync completes.
- **Duplicates return 200.** A replay is resolved *before* the licence cap check.
- **`capturedAt`** is clamped to [campaign start − 1 day, now].
- **iOS device enrolment (SEC-H2):**
  - Format checks, size and rate limits, and registered devices protected.
  - PKCS#7 signature verification, enforced once `IOS_UDID_CA_FILE` is set.
- **Test-database guard:** the API test suite refuses to run against any database that isn't a local `*_test` database.

### Operations (S0.5)
- **Backups** (`infra/backup.sh`):
  - Postgres, MinIO, Redis and `.env`, encrypted with age using the key in `.env`, and sent to S3-compatible storage.
  - 30 daily + 12 monthly copies off-site.
  - Exit 2 `[BACKUP-INCOMPLETE]` instead of silently leaving an unencrypted archive behind.
- **Restore test** (`infra/restore-test.sh`): restores the newest off-site backup into an isolated stack. It checks migration status, every table's row count and every bucket's file count, and that the Redis snapshot loads.
- **Deploy** (`infra/deploy.sh`):
  - Build, then migrations as their own step: a failure stops the deploy with the old version still serving.
  - Then a wait until every container is healthy, and a check of `/health/ready`.
  - The certbot reload hook is installed.
- **Alerts:** an email for background jobs that fail for good (throttled), optional browser error tracking, web/admin healthchecks, and log rotation at 20 MB × 5.
- **CI:** now runs the worker, shared, web and scripts tests, which never ran before. Dependabot covers every service image.
- **MinIO.** The official images can no longer be pulled, which made every rebuild impossible. MinIO is now built from source (pinned by tag and commit) on the 2025-10-15 security release (GHSA-jjjj-jwhf-8rgr). Data written by production's version was verified readable.

### TUDA (S0.6)
- **`npm run seed:tuda`:**
  - Tenant "TUDA — Tbilisi Transport and Urban Development Agency": standalone; GEL, GE, Asia/Tbilisi (new `Company.timezone`); `gis`, `ipsas` and `reconciliation` on.
  - Roles Administrator, Finance, Inventory Manager, Field Operator, Verifier, Viewer.
  - An Enterprise licence, and the first administrator by invitation (the link is printed).
  - Idempotent.
- **`infra/docker-compose.standalone.yml`:** the production stack plus PostGIS, closed registration (API and web), and nginx for the install's own host names and certificates. The same deploy, backup and restore-test scripts work unchanged.
- **`scripts/profile-register.py`:**
  - Profiles a legacy Excel or CSV register (English, Georgian or Russian headers).
  - Flags duplicate asset numbers, blank names, non-numeric costs and dates outside 1990–today.
  - Writes an A4-landscape Excel report and a column mapping for the importer.
  - A synthetic sample with planted problems is included.

### S0.5 follow-up (after the first PR review)
- **SEC-M3:** a one-shot `minio-init` gives the API its own MinIO user, limited to the three app buckets. The root password no longer reaches the API container.
- **COM-3:** nginx and API timeouts. A report taking 65 s used to return 504 at 60 s; now it completes.
- **SEC-M6 (partly):** `APP_ENCRYPTION_KEY` is documented (DEPLOY.md and both env templates) and checked at startup in production. The prod template also lists the scoped MinIO user and backup variables. The key minimum is now 32 characters (MinIO app secret too). The static salt stays (needs a re-encryption migration).

### Bugs found and fixed while doing the above
Every one is recorded in `docs/known-fix-registry.md` (**KFR-006 to KFR-035**). The notable ones:
- **iOS sync re-sent rows within a run** (SwiftData object identity, KFR-017). Caught by an intermittent test.
- **The restore test compared only the first table** (KFR-027). Caught by its own test.
- **The API test suite intermittently talked to other apps on macOS** (KFR-025).
- **pandas silently read "n/a" as blank** (KFR-031).

## How to verify

| What | Command | Result at close |
|---|---|---|
| Lint | `npm run lint` | 0 errors (73 warnings, unchanged from the baseline) |
| API | `npm run test:api` (throwaway Postgres + Redis in Docker) | 230 / 230 |
| Worker, shared, web | `npm test --workspace=vairiot-worker --workspace=vairiot-shared --workspace=vairiot-web` | 5 / 5, 42 / 42, 12 / 12 |
| Android | `cd vairiot-mobile && ./gradlew testDebugUnitTest` | 62 / 62 |
| iOS | `cd vairiot-ios && xcodebuild -scheme VairiotMobile -destination 'platform=iOS Simulator,name=iPhone 17' test` | 41 / 41 |
| Register profiler | `python3 -m unittest discover -s scripts/tests` | 17 / 17 |
| TUDA seed | `npm run seed:tuda --workspace=vairiot-api` (with `TUDA_ADMIN_EMAIL`, `DATABASE_URL`) | creates the tenant, prints the invite link |
| Profiler | `python3 scripts/profile-register.py scripts/samples/register-sample.xlsx` | writes report + mapping; finds the planted problems |
| Backups | `bash infra/backup.sh && bash infra/restore-test.sh` (on a server) | verified end to end in throwaway containers (see KFR-026/027) |

**On the server, to activate S0.5** (nothing here happens by itself; see DEPLOY.md):
1. Install `age` and `rclone`, and create the age key pair. Keep the private key off the server too.
2. Add `BACKUP_AGE_RECIPIENT` and the `BACKUP_S3_*` settings to `.env`.
3. **Replace** the old backup crontab line, which passes a placeholder key.
4. Run one backup and one restore test.
5. Set `OPS_ALERT_EMAIL` and (optionally) `SENTRY_DSN` / `VITE_SENTRY_DSN`, and create the external uptime monitor.

**Before the next mobile releases:** bump the Android `versionCode` (Room migration to v7) and the iOS build number. Then test an in-place upgrade with queued offline work on a real device, and iOS background sync on a device.

## What remains open

| Item | Why it's open | Where |
|---|---|---|
| SEC-M6 static scrypt salt | Changing it needs a re-encryption migration of stored secrets (KFR-035) | triage |
| iOS enrolment signature enforcement | Needs `IOS_UDID_CA_FILE` and a check with a real iPhone | DEPLOY.md |
| Maintenance photos offline; server-side photo dedupe | Out of S0 scope | OFF-4 |
| `postgres`, `redis`, `nginx` images not pinned | Tags on the server unknown; a wrong pin breaks deploys | INF-9 |
| Registry-based deploys and rollback; CI gating deploys | Larger infra change | INF-1, INF-3 |
| SEC-L3/L4 (Android token storage, certificate pinning), SAAS-5/7/8/9/10, STO-2…7, COM-2/6 | Deferred with reasons in the triage | triage |
| Blind-audit scan responses include `assetId` | Noticed in S0.4; may reveal matches blind mode should hide | to triage in S3 |
| TUDA licence renewal | Enterprise licence runs 12 months; no platform admin on a standalone server | DEPLOY.md |

## Files changed (160)

Relative to `16df41e`.


### .env.example

- `.env.example` (modified)

### .github

- `.github/dependabot.yml` (modified)
- `.github/workflows/ci.yml` (modified)

### .gitignore

- `.gitignore` (modified)

### DEPLOY.md

- `DEPLOY.md` (modified)

### docs

- `docs/sprints/README.md` (added)
- `docs/sprints/S0-audit-triage.md` (added)
- `docs/sprints/S0-hardening-and-hosting.md` (added)
- `docs/sprints/S0-summary.md` (added)
- `docs/sprints/S1-gis-condition-photos.md` (added)
- `docs/sprints/S2-ipsas-ledger-import.md` (added)
- `docs/sprints/S3-zones-qa-georgian.md` (added)
- `docs/sprints/S4-reconciliation-and-dq.md` (added)
- `docs/sprints/S5-reporting-and-handover.md` (added)
- `docs/STAGING-SETUP.md` (modified)
- `docs/known-fix-registry.md` (modified)

### infra

- `infra/certbot/reload-nginx.sh` (added)
- `infra/docker-compose.restoretest.yml` (added)
- `infra/docker-compose.standalone.yml` (added)
- `infra/minio/Dockerfile` (added)
- `infra/minio/init.sh` (added)
- `infra/nginx/standalone-default.conf` (added)
- `infra/nginx/standalone.conf.template` (added)
- `infra/restore-test.sh` (added)
- `infra/.env.prod.example` (modified)
- `infra/backup.crontab` (modified)
- `infra/backup.sh` (modified)
- `infra/deploy.sh` (modified)
- `infra/docker-compose.infra.yml` (modified)
- `infra/docker-compose.prod.yml` (modified)
- `infra/docker-compose.yml` (modified)
- `infra/nginx/prod.conf` (modified)
- `infra/nginx/staging-shared-host.conf` (modified)
- `infra/nginx/staging.conf` (modified)
- `infra/restore.sh` (modified)

### package-lock.json

- `package-lock.json` (modified)

### scripts

- `scripts/profile-register.py` (added)
- `scripts/requirements.txt` (added)
- `scripts/samples/make-register-sample.py` (added)
- `scripts/samples/register-sample.xlsx` (added)
- `scripts/tests/test_profile_register.py` (added)

### vairiot-api

- `vairiot-api/prisma/migrations/20261005000000_s0_delta_sync_ios_enrolment/migration.sql` (added)
- `vairiot-api/prisma/migrations/20261006000000_s0_company_timezone/migration.sql` (added)
- `vairiot-api/prisma/seed-tuda.ts` (added)
- `vairiot-api/src/__tests__/crypto-key.test.ts` (added)
- `vairiot-api/src/__tests__/ios/ios-enrolment.test.ts` (added)
- `vairiot-api/src/__tests__/server-timeouts.test.ts` (added)
- `vairiot-api/src/__tests__/sync/replicas.test.ts` (added)
- `vairiot-api/src/__tests__/sync/sync-hardening.test.ts` (added)
- `vairiot-api/src/__tests__/test-server-binding.test.ts` (added)
- `vairiot-api/src/__tests__/tuda/seed-tuda.test.ts` (added)
- `vairiot-api/src/lib/ios-enrolment.ts` (added)
- `vairiot-api/src/lib/server-timeouts.ts` (added)
- `vairiot-api/jest.setup.ts` (modified)
- `vairiot-api/package.json` (modified)
- `vairiot-api/prisma/schema.prisma` (modified)
- `vairiot-api/src/__tests__/assets/assets.test.ts` (modified)
- `vairiot-api/src/__tests__/audits/audits.test.ts` (modified)
- `vairiot-api/src/app.ts` (modified)
- `vairiot-api/src/index.ts` (modified)
- `vairiot-api/src/lib/crypto.ts` (modified)
- `vairiot-api/src/lib/feature-flags.ts` (modified)
- `vairiot-api/src/lib/openapi.ts` (modified)
- `vairiot-api/src/middleware/rate-limit.ts` (modified)
- `vairiot-api/src/routes/assets/assets.router.ts` (modified)
- `vairiot-api/src/routes/audits/audits.router.ts` (modified)
- `vairiot-api/src/routes/auth/auth.router.ts` (modified)
- `vairiot-api/src/routes/ios/ios.router.ts` (modified)
- `vairiot-api/src/routes/mobile/mobile.router.ts` (modified)
- `vairiot-api/src/services/asset.service.ts` (modified)
- `vairiot-api/src/services/audit.service.ts` (modified)

### vairiot-ios

- `vairiot-ios/VairiotMobile.xcodeproj/xcshareddata/xcschemes/VairiotMobile.xcscheme` (added)
- `vairiot-ios/VairiotMobile/Data/AssetDeltaSync.swift` (added)
- `vairiot-ios/VairiotMobile/Data/QueuedPhoto.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/AuditScanRecorder.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/BackgroundSync.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/QueueDrainer.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/QueueState.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/SyncFailure.swift` (added)
- `vairiot-ios/VairiotMobile/Sync/SyncQueues.swift` (added)
- `vairiot-ios/VairiotMobileTests/AssetAndPhotoQueueTests.swift` (added)
- `vairiot-ios/VairiotMobileTests/AssetDeltaSyncTests.swift` (added)
- `vairiot-ios/VairiotMobileTests/AuditScanRecorderTests.swift` (added)
- `vairiot-ios/VairiotMobileTests/QueueDrainerTests.swift` (added)
- `vairiot-ios/VairiotMobileTests/SyncFailureTests.swift` (added)
- `vairiot-ios/VairiotMobileTests/SyncTestSupport.swift` (added)
- `vairiot-ios/VairiotMobile.xcodeproj/project.pbxproj` (modified)
- `vairiot-ios/VairiotMobile/API/APIClient.swift` (modified)
- `vairiot-ios/VairiotMobile/API/APIEndpoint.swift` (modified)
- `vairiot-ios/VairiotMobile/App/VairiotApp.swift` (modified)
- `vairiot-ios/VairiotMobile/Data/AssetRepository.swift` (modified)
- `vairiot-ios/VairiotMobile/Data/QueuedAssetCreate.swift` (modified)
- `vairiot-ios/VairiotMobile/Data/QueuedScan.swift` (modified)
- `vairiot-ios/VairiotMobile/Data/SyncManager.swift` (modified)
- `vairiot-ios/VairiotMobile/Data/VairiotStore.swift` (modified)
- `vairiot-ios/VairiotMobile/Models/Asset.swift` (modified)
- `vairiot-ios/VairiotMobile/Resources/Info.plist` (modified)
- `vairiot-ios/VairiotMobile/Screens/Assets/AssetEditViewModel.swift` (modified)
- `vairiot-ios/VairiotMobile/Screens/Assets/AssetListView.swift` (modified)
- `vairiot-ios/VairiotMobile/Screens/Assets/AssetPhotosView.swift` (modified)
- `vairiot-ios/VairiotMobile/Screens/Audits/AuditRunView.swift` (modified)
- `vairiot-ios/VairiotMobile/Screens/Audits/AuditRunViewModel.swift` (modified)
- `vairiot-ios/VairiotMobile/Screens/Profile/ProfileView.swift` (modified)
- `vairiot-ios/project.yml` (modified)

### vairiot-mobile

- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/AssetDeltaSync.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/AssetSyncStateStore.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedPhoto.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedPhotoDao.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/AuditScanRecorder.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/PhotoSyncScheduler.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/PhotoSyncWorker.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/QueueDrainer.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/SyncQueues.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/WorkResults.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/util/SyncAge.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/data/AssetDeltaSyncTest.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/AssetAndPhotoQueueTest.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/AuditScanRecorderTest.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/QueueDrainerTest.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/SyncFailureTest.kt` (added)
- `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/SyncFakes.kt` (added)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/VairiotApp.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/AssetRepository.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/ScanSessionRepository.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/ApiModels.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/VairiotApiService.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/CachedAssetDao.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedAssetDao.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedScan.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedScanDao.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/TokenStore.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/VairiotDatabase.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/di/DatabaseModule.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/di/NetworkModule.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/AssetSyncWorker.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/ScanSyncWorker.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/SyncFailure.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetListScreen.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetListViewModel.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetPhotosSection.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetPhotosViewModel.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetScanViewModel.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AuditRunViewModel.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/ProfileScreen.kt` (modified)
- `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/ProfileViewModel.kt` (modified)

### vairiot-web

- `vairiot-web/src/__tests__/monitoring.test.ts` (added)
- `vairiot-web/src/__tests__/registration.test.ts` (added)
- `vairiot-web/src/lib/monitoring.ts` (added)
- `vairiot-web/src/lib/registration.ts` (added)
- `vairiot-web/Dockerfile` (modified)
- `vairiot-web/package.json` (modified)
- `vairiot-web/src/App.tsx` (modified)
- `vairiot-web/src/main.tsx` (modified)
- `vairiot-web/src/pages/auth/LoginPage.tsx` (modified)

### vairiot-worker

- `vairiot-worker/jest.config.js` (added)
- `vairiot-worker/src/__tests__/job-alerts.test.ts` (added)
- `vairiot-worker/src/job-alerts.ts` (added)
- `vairiot-worker/package.json` (modified)
- `vairiot-worker/src/crypto.ts` (modified)
- `vairiot-worker/src/index.ts` (modified)
