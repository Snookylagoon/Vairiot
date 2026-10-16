# Sprint S1 — GIS, condition and photos: summary

**Branches:** `feat/asset-gis-position` (stages 1.1–1.3, PR #70), then one branch per workstream merged into `dev` (PRs #87–#92) and `feat/phase-1-close` (stages 1.20–1.21) · **Closed:** 16 October 2026 · **Version:** 2.6.1 · **Feeds:** TOR Deliverable D4 (GIS database structure: [GIS-DATA-MODEL.md](../GIS-DATA-MODEL.md))

**Goal:** every asset and every audit scan has a trustworthy position, condition is graded on one scale, photos are evidence tied to the scan they prove, and the register can be seen on a map.

**Outcome:**
- **Positions everywhere, on PostGIS.** Assets, audit scans, the campaign snapshot and photos carry a WGS 84 position with accuracy, source and time. PostGIS `geography` columns are kept in step by triggers and indexed for area queries. Both apps capture a fix in the background during an audit.
- **The map is a working tool.** All assets are clustered on one map with the asset list's filters. A campaign layer colours expected assets by count state. Positions can be set by clicking or dragging on a map. Each tenant chooses its own base map.
- **Photos are evidence.** A photo taken during an audit is bound to its scan, with capture time and position read from the device or EXIF. The stored original keeps its metadata. Every copy that leaves the API is stripped (D13).
- **Condition is graded.** A 1–5 scale per tenant and category, with criteria. Grades are set in the web and both apps, and changes are recorded as ledger events. Photo rules flag scans that need evidence. The condition report counts by grade.
- **Security moved forward.**
  - Every app container runs unprivileged.
  - Administrators must use two-factor after a 14-day grace period.
  - The database itself enforces tenant isolation on assets, audit events and photos.
- **Browser tests exist.** Playwright runs the map in a real browser, in CI with the API mocked and on the Docker stack before a release.
- **GIS stays switchable.** Every GIS route answers 404 for a tenant with `gis` off, and nothing is lost when it is switched back on.

## Stages and commits

| Stage     | Commit(s)                       | What                                                                                     | Version |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| 1.1       | `5f78644`                       | GIS position columns on assets; validation in `vairiot-shared`                           | —       |
| 1.2       | (PR #70)                        | GPS capture in the Android and iOS asset screens                                         | —       |
| 1.3       | `10ad7ba`                       | All-assets map in the web console                                                        | —       |
| 1.0       | `b7ba703`                       | Phase 0 accepted; this phase planned                                                     | 2.0.1   |
| 1.4       | `dd4c4ff`                       | PostGIS in every stack; `assets.geom` by trigger; `GET /assets/geo?bbox=`                | 2.1.0   |
| 1.5       | `0024a2b`                       | Positions on audit scans; `POSITION_CAPTURED` / `POSITION_CORRECTED` ledger events       | 2.2.0   |
| 1.6       | `de651d0`                       | Adoption merged into `dev`; branches and worktrees cleaned                               | 2.2.0   |
| 1.7–1.9   | `7f9f3e9`, `05d0f84`, `8a266af` | Photos bound to audit scans: API with EXIF reading, both apps, web gallery               | 2.3.0   |
| 1.10–1.12 | `72e69f7`, `3623a35`            | Campaign layer, pick on map, per-tenant base maps                                        | 2.4.0   |
| 1.13–1.16 | `12f42ef`, `664fc12`, `bbbe2f4`, `32c9855` | Condition scale, grades, events, photo rules; web, apps and report            | 2.5.0   |
| 1.17–1.19 | `ff60ac2`, `7d992f4`, `d27251a` | Non-root containers, mandatory two-factor, row-level security                            | 2.6.0   |
| 1.20      | `ee52582`                       | Playwright map smoke with the API mocked                                                 | —       |
| 1.21      | this branch                     | Exit gate on the Docker stack, nginx healthcheck fix, stack smoke, phase record          | 2.6.1   |

## What changed

### Positions and PostGIS (stages 1.1, 1.4, 1.5)
- **One model for positions.** `latitude`, `longitude`, `geoAccuracyMeters`, `geoSource` and `geoCapturedAt` on assets; the same on audit scans; the expected position on the campaign snapshot. Database checks keep the pair together and in range.
- **PostGIS `geography(Point,4326)`** on assets and scans, set only by triggers from the plain columns, with GIST indexes. No write path changed, so older apps keep working.
- **`GET /assets/geo?bbox=`** returns GeoJSON for an area. **`GET /audits/:id/scans/geo`** returns a campaign's positioned scans.
- **The ledger records position changes.** A first position is `POSITION_CAPTURED`; a move of more than 1 m is `POSITION_CORRECTED`, with the previous position.
- **Background fixes in both apps.** A fix is refreshed every 20 s while an audit is open and attached to a scan if it is under 60 s old. A position the server can't use is dropped; the scan is never refused for it.
- **Image switch (D11).** PostGIS 3.5 on Postgres 16 Alpine in every stack, CI and the restore test, with an ARM override.

### Map (stages 1.3, 1.10–1.12)
- **Clustered register map.** The `/assets/map` page uses status colours and the asset list's filters, and counts assets without a position.
- **Campaign layer.** Choosing a campaign colours its expected assets as verified, misplaced, condition variance, missing or not yet scanned. Surplus tags show at their scan position, and a blind count in progress shows only scanned or not.
- **"Pick on map" in the asset form.** A click or drag sets a manual position; the ledger records it.
- **Per-tenant base map.** Tile server, attribution, centre and zoom, under Administration → Map Settings. TUDA opens on Tbilisi.

### Photos as evidence (stages 1.7–1.9)
- **Scan photos.** `POST /audits/:id/scans/:scanRef/photos`, where the scan reference is the scan id or the device's request key, so an offline photo can follow its scan. Each photo has a type (inventory, condition, label, general), with up to four per scan.
- **Time and position.** Taken from what the device sent, else the photo's EXIF, else the scan. The EXIF reader is pure TypeScript with no native dependency.
- **"Add photo to <tag>" in both apps.** Photos go through the offline photo queue, which waits for their scan to upload first.
- **Web gallery.** On the audit run and reconciliation pages, with time, position and accuracy.

### Condition (stages 1.13–1.16)
- **Scale.** Grades 5 Excellent to 1 Unserviceable, with criteria, per tenant and per category. Each grade is kept in step with the old condition strings, so older apps, filters and reports keep working. Existing records were graded from their strings.
- **Events.** `CONDITION_ASSESSED` on the ledger when the grade changes, shown as condition history on the asset page.
- **Photo rules.** A minimum number of photos by category, and a photo required below a chosen grade. Zone submission and `GET /audits/:id/photo-warnings` list the shortfalls without blocking.
- **Apps.** Grade 1–5 on the audit screen, with a photo prompt where the grade needs one. Works offline with the built-in scale.
- **Report.** The condition report counts by grade.

### Security (stages 1.17–1.19)
- **Containers.**
  - API and worker run as `node`, reports as `app`, and web and admin on unprivileged nginx (port 8080).
  - Every app container drops all capabilities and sets `no-new-privileges`.
  - Metrics are unreachable through the proxy.
- **Two-factor.** Mandatory for Platform Super Admin, Licensing Authority, Company Admin and the Administrator role, after a 14-day grace period.
- **Row-level security.** `assets`, `audit_events` and `photos` are forced and checked against `app.tenant_id` under a restricted role on every request connection.

### Testing and close (stages 1.20–1.21)
- **Playwright.** `vairiot-web/e2e/asset-map.smoke.ts` runs in CI with the API mocked. `asset-map.stack.ts` signs in to a running stack and checks the map against the API.
- **Exit gate on the Docker stack.** Production images with the standalone (TUDA) overlay, behind nginx with TLS, on a fresh database; [Phase 1 record](../04-phase-1-record.md) §2.
- **Fix found by the gate: nginx never became healthy (KFR-044).** Its healthcheck asked for `localhost`, which now resolves to IPv6 first, and the sites listen on IPv4 only.

## How to verify

| Check | Command or step |
| ----- | --------------- |
| Unit and integration | `npm run check`; `./scripts/test-api.sh` (on ARM: `POSTGIS_IMAGE=imresamu/postgis:16-3.5-alpine`); `npm test --workspace vairiot-web`; `./gradlew testDebugUnitTest` in `vairiot-mobile`; the iOS scheme's unit tests |
| Map in a browser | `npm run test:e2e --workspace vairiot-web` |
| Map on a stack | `E2E_BASE_URL=… E2E_TENANT=tuda E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e:stack --workspace vairiot-web` |
| GeoJSON | Signed in to a `gis` tenant: `GET /api/v1/assets/geo?bbox=44.7,41.6,44.9,41.8` |
| Toggle | Switch `gis` off for the tenant: `/assets/map`, `/assets/geo`, `/gis/map-settings` answer 404 and the web hides the map |
| Field (manual) | [manual-checks.md](../testing/manual-checks.md): an asset created outdoors on a Meferi keeps its position with accuracy; grade 2 on an audit scan prompts for a photo |

## What remains open

| #   | Item | Proposed handling |
| --- | ---- | ----------------- |
| 1 | S1.2 field check on a Meferi outdoors and S1.5 photo prompt on a device: not yet done | Owner or field team, before acceptance ([Phase 1 record](../04-phase-1-record.md) §3) |
| 2 | Production still runs the pre-2.0 stack: the PostGIS image switch, 2.x and tags `phase-0-accepted`, `v2.x` wait for promotion of `dev` to `main` | Release step after acceptance, following DEPLOY.md |
| 3 | Row-level security on the other tenant tables (G23) | Phase 2 security workstream |
| 4 | No Content-Security-Policy (G31); MinIO runs as root (G32) | Phase 2 security workstream |
| 5 | The register export (`/assets/export.csv`) has Latitude and Longitude but not the grade, accuracy or position source; the profiler (`scripts/profile-register.py`) does not map Latitude and Longitude (G33) | S2 import and export work |
| 6 | The login form's labels are not tied to their inputs, so screen readers and `getByLabel` miss them (G34) | S3 accessibility work (axe in Playwright) |
| 7 | `altitudeM`, `gisFeatureId`, `gisLayer`, `sourceCrs`; national-grid transformation; `Location.boundary` | S5 GIS exchange; S3 zones |
| 8 | Burned-in photo stamp; server-side thumbnails | Deferred (Phase 1 plan §2.2) |
| 9 | Schema drift that predates stage 1.4 (`asset_events` index and `hash` default) | Reconcile in a Phase 2 migration |
| 10 | Prettier across the codebase (G28); admin has no tests | At a quiet point; adoption W5 |

## Files

The full list of files added or changed in this phase, from `7e8def5` (the end of Phase 0) to this branch, excluding `package-lock.json`. Stages 1.1–1.3 came earlier, in PR #70.

**Repository root** (6)

- changed `.gitignore`
- changed `.trivyignore`
- changed `CHANGELOG.md`
- changed `DEPLOY.md`
- changed `package.json`
- changed `project.md`

**.github** (1)

- changed `.github/workflows/ci.yml`

**docs** (17)

- new `docs/03-phase-1-plan.md`
- new `docs/04-phase-1-record.md`
- new `docs/GIS-DATA-MODEL.md`
- changed `docs/known-fix-registry.md`
- changed `docs/sprints/README.md`
- changed `docs/sprints/S1-gis-condition-photos.md`
- new `docs/sprints/S1-summary.md`
- changed `docs/sprints/S2-ipsas-ledger-import.md`
- changed `docs/sprints/S3-zones-qa-georgian.md`
- changed `docs/sprints/S4-reconciliation-and-dq.md`
- changed `docs/sprints/S5-reporting-and-handover.md`
- changed `docs/stage-log.md`
- changed `docs/standard-adoption-plan.md`
- changed `docs/testing/manual-checks.md`
- changed `docs/testing/test-plan.md`
- new `docs/word/Vairiot-AI-Phase-1-GIS-Condition-Photos.docx`
- new `docs/word/build_phase1.py`

**infra** (14)

- changed `infra/docker-compose.infra.yml`
- changed `infra/docker-compose.prod.yml`
- changed `infra/docker-compose.restoretest.yml`
- changed `infra/docker-compose.staging-shared.yml`
- changed `infra/docker-compose.standalone.yml`
- changed `infra/docker-compose.test.yml`
- changed `infra/docker-compose.yml`
- changed `infra/minio/Dockerfile`
- changed `infra/nginx/dev.conf`
- changed `infra/nginx/prod.conf`
- changed `infra/nginx/staging-shared-host.conf`
- changed `infra/nginx/staging.conf`
- changed `infra/nginx/standalone.conf.template`
- changed `infra/restore.sh`

**scripts** (1)

- changed `scripts/line-limit-baseline.txt`

**vairiot-admin** (5)

- changed `vairiot-admin/Dockerfile`
- changed `vairiot-admin/nginx.conf`
- changed `vairiot-admin/package.json`
- changed `vairiot-admin/src/components/layout/AdminShell.tsx`
- new `vairiot-admin/src/components/layout/TwoFactorDueBanner.tsx`

**vairiot-api** (64)

- changed `vairiot-api/Dockerfile`
- changed `vairiot-api/package.json`
- new `vairiot-api/prisma/migrations/20261016000000_postgis_asset_geom/migration.sql`
- new `vairiot-api/prisma/migrations/20261016010000_scan_positions/migration.sql`
- new `vairiot-api/prisma/migrations/20261016020000_scan_photos/migration.sql`
- new `vairiot-api/prisma/migrations/20261016030000_tenant_map_settings/migration.sql`
- new `vairiot-api/prisma/migrations/20261016040000_condition_scale/migration.sql`
- new `vairiot-api/prisma/migrations/20261016050000_two_factor_grace/migration.sql`
- new `vairiot-api/prisma/migrations/20261016060000_row_level_security/migration.sql`
- changed `vairiot-api/prisma/schema.prisma`
- changed `vairiot-api/prisma/seed-tuda.ts`
- new `vairiot-api/src/__tests__/assets/asset-geo-bbox.test.ts`
- new `vairiot-api/src/__tests__/audits/campaign-map.test.ts`
- new `vairiot-api/src/__tests__/audits/scan-photos.test.ts`
- new `vairiot-api/src/__tests__/audits/scan-positions.test.ts`
- new `vairiot-api/src/__tests__/condition/condition-scale.test.ts`
- new `vairiot-api/src/__tests__/gis/map-settings.test.ts`
- new `vairiot-api/src/__tests__/photos/exif-fixtures.ts`
- new `vairiot-api/src/__tests__/photos/exif-read.test.ts`
- new `vairiot-api/src/__tests__/reports/condition-report.test.ts`
- new `vairiot-api/src/__tests__/security/compose-healthchecks.test.ts`
- new `vairiot-api/src/__tests__/security/row-level-security.test.ts`
- changed `vairiot-api/src/__tests__/security/security.test.ts`
- new `vairiot-api/src/__tests__/security/two-factor-mandatory.test.ts`
- new `vairiot-api/src/__tests__/security/w6-hardening.test.ts`
- changed `vairiot-api/src/app.ts`
- changed `vairiot-api/src/index.ts`
- new `vairiot-api/src/lib/api-spec.ts`
- changed `vairiot-api/src/lib/crypto.ts`
- new `vairiot-api/src/lib/image-metadata/exif-read.ts`
- new `vairiot-api/src/lib/map-settings.ts`
- new `vairiot-api/src/lib/openapi-condition.ts`
- new `vairiot-api/src/lib/openapi-gis.ts`
- new `vairiot-api/src/lib/openapi-photos.ts`
- changed `vairiot-api/src/lib/prisma.ts`
- new `vairiot-api/src/lib/rls-check.ts`
- new `vairiot-api/src/lib/rls-pool.ts`
- new `vairiot-api/src/lib/tenant-context.ts`
- changed `vairiot-api/src/routes/admin/platform.router.ts`
- changed `vairiot-api/src/routes/assets/assets.router.ts`
- new `vairiot-api/src/routes/audits/audit-photos.router.ts`
- changed `vairiot-api/src/routes/audits/audits.router.ts`
- changed `vairiot-api/src/routes/auth/auth.router.ts`
- new `vairiot-api/src/routes/condition/condition.router.ts`
- new `vairiot-api/src/routes/gis/gis.router.ts`
- changed `vairiot-api/src/routes/ios/ios.router.ts`
- changed `vairiot-api/src/routes/photos/photos.router.ts`
- changed `vairiot-api/src/routes/reports/reports.router.ts`
- changed `vairiot-api/src/services/asset-cap.service.ts`
- new `vairiot-api/src/services/asset-change-events.service.ts`
- new `vairiot-api/src/services/asset-geo-query.service.ts`
- changed `vairiot-api/src/services/asset-geo.service.ts`
- changed `vairiot-api/src/services/asset.service.ts`
- new `vairiot-api/src/services/audit-scan.service.ts`
- changed `vairiot-api/src/services/audit.service.ts`
- changed `vairiot-api/src/services/auth.service.ts`
- new `vairiot-api/src/services/campaign-map.service.ts`
- new `vairiot-api/src/services/condition.service.ts`
- changed `vairiot-api/src/services/licence-status.service.ts`
- changed `vairiot-api/src/services/photo.service.ts`
- changed `vairiot-api/src/services/report-export.service.ts`
- new `vairiot-api/src/services/scan-photo.service.ts`
- new `vairiot-api/src/services/two-factor-grace.service.ts`
- changed `vairiot-api/src/services/two-factor.service.ts`

**vairiot-ios** (18)

- changed `vairiot-ios/VairiotMobile.xcodeproj/project.pbxproj`
- changed `vairiot-ios/VairiotMobile/API/APIClient.swift`
- new `vairiot-ios/VairiotMobile/Components/ImageThumbnail.swift`
- changed `vairiot-ios/VairiotMobile/Data/QueuedPhoto.swift`
- changed `vairiot-ios/VairiotMobile/Data/QueuedScan.swift`
- new `vairiot-ios/VairiotMobile/Location/ScanPositionTracker.swift`
- changed `vairiot-ios/VairiotMobile/Models/Audit.swift`
- new `vairiot-ios/VairiotMobile/Models/ConditionScale.swift`
- changed `vairiot-ios/VairiotMobile/Screens/Audits/AuditRunView.swift`
- changed `vairiot-ios/VairiotMobile/Screens/Audits/AuditRunViewModel.swift`
- new `vairiot-ios/VairiotMobile/Screens/Audits/ConditionGradePicker.swift`
- new `vairiot-ios/VairiotMobile/Screens/Audits/ScanPhotoButton.swift`
- changed `vairiot-ios/VairiotMobile/Sync/AuditScanRecorder.swift`
- changed `vairiot-ios/VairiotMobile/Sync/SyncQueues.swift`
- new `vairiot-ios/VairiotMobileTests/ConditionGradeTests.swift`
- new `vairiot-ios/VairiotMobileTests/ScanPhotoQueueTests.swift`
- new `vairiot-ios/VairiotMobileTests/ScanPositionTrackerTests.swift`
- changed `vairiot-ios/project.yml`

**vairiot-mobile** (25)

- changed `vairiot-mobile/app/build.gradle.kts`
- changed `vairiot-mobile/app/src/main/AndroidManifest.xml`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/ApiModels.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/AuditScanModels.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/VairiotApiService.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedPhoto.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedPhotoDao.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/QueuedScan.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/VairiotDatabase.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/di/DatabaseModule.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/domain/model/ConditionScale.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/location/ScanPositionTracker.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/AuditScanRecorder.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/PhotoSyncWorker.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/sync/SyncQueues.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/components/LocationPermissionPrompt.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetPhotosSection.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AuditMessages.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AuditRunScreen.kt`
- changed `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AuditRunViewModel.kt`
- new `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/ConditionGradePicker.kt`
- new `vairiot-mobile/app/src/test/java/com/vairiot/app/location/ScanPositionTrackerTest.kt`
- changed `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/AuditScanRecorderTest.kt`
- new `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/ScanPhotoQueueTest.kt`
- changed `vairiot-mobile/app/src/test/java/com/vairiot/app/sync/SyncFakes.kt`

**vairiot-reports** (3)

- changed `vairiot-reports/Dockerfile`
- changed `vairiot-reports/app/reports/assets/asset_condition.py`
- changed `vairiot-reports/pyproject.toml`

**vairiot-shared** (8)

- changed `vairiot-shared/package.json`
- new `vairiot-shared/src/__tests__/condition.test.ts`
- changed `vairiot-shared/src/__tests__/geo.test.ts`
- new `vairiot-shared/src/constants/condition.constants.ts`
- changed `vairiot-shared/src/constants/roles.constants.ts`
- changed `vairiot-shared/src/geo/index.ts`
- changed `vairiot-shared/src/index.ts`
- changed `vairiot-shared/src/types/auth.types.ts`

**vairiot-web** (36)

- changed `vairiot-web/Dockerfile`
- changed `vairiot-web/README.md`
- new `vairiot-web/e2e/asset-map.smoke.ts`
- new `vairiot-web/e2e/asset-map.stack.ts`
- new `vairiot-web/e2e/fixtures.ts`
- new `vairiot-web/e2e/tsconfig.json`
- changed `vairiot-web/nginx.conf`
- changed `vairiot-web/package.json`
- new `vairiot-web/playwright.config.ts`
- new `vairiot-web/playwright.stack.config.ts`
- changed `vairiot-web/src/App.tsx`
- changed `vairiot-web/src/__tests__/AssetMap.test.tsx`
- new `vairiot-web/src/__tests__/Condition.test.tsx`
- new `vairiot-web/src/__tests__/MapSettings.test.tsx`
- new `vairiot-web/src/__tests__/ScanPhotoGallery.test.tsx`
- new `vairiot-web/src/__tests__/TwoFactorDueBanner.test.tsx`
- new `vairiot-web/src/components/assets/ConditionHistory.tsx`
- new `vairiot-web/src/components/audits/ScanPhotoGallery.tsx`
- changed `vairiot-web/src/components/forms/AssetForm.tsx`
- new `vairiot-web/src/components/forms/ConditionSelect.tsx`
- changed `vairiot-web/src/components/forms/GeoPositionFields.tsx`
- changed `vairiot-web/src/components/geo/AssetClusterMap.tsx`
- new `vairiot-web/src/components/geo/PositionPickerMap.tsx`
- changed `vairiot-web/src/components/layout/AppShell.tsx`
- new `vairiot-web/src/components/layout/TwoFactorDueBanner.tsx`
- new `vairiot-web/src/hooks/useBaseMap.ts`
- new `vairiot-web/src/hooks/useCampaignMap.ts`
- new `vairiot-web/src/hooks/useCondition.ts`
- new `vairiot-web/src/lib/campaignMap.ts`
- new `vairiot-web/src/pages/admin/ConditionScalePage.tsx`
- new `vairiot-web/src/pages/admin/MapSettingsPage.tsx`
- changed `vairiot-web/src/pages/assets/AssetDetailPage.tsx`
- changed `vairiot-web/src/pages/assets/AssetMapPage.tsx`
- changed `vairiot-web/src/pages/assets/EditAssetPage.tsx`
- changed `vairiot-web/src/pages/audits/AuditReconciliationPage.tsx`
- changed `vairiot-web/src/pages/audits/AuditRunPage.tsx`

**vairiot-worker** (3)

- changed `vairiot-worker/Dockerfile`
- changed `vairiot-worker/package.json`
- changed `vairiot-worker/src/crypto.ts`
