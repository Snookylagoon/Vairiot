# Changelog

All notable changes to Vairiot Asset Intelligence, newest first. One product version covers every package, service and app (standard §8.1). Each line ends with the stage it came from; entries before 2.0.0 are back-filled from the commit history and predate stage numbering.

## [2.6.1] — 2026-10-16

### Fixed

- The bundled nginx now reports healthy: its healthcheck asked for `localhost`, which the current nginx image resolves to IPv6 first, so deploys waiting for healthy containers could time out (stage 1.21, KFR-044)

### Added

- Browser smoke tests of the asset map with Playwright, in CI with the API mocked and against a running stack before a release (stages 1.20–1.21)
- GIS data model documentation for the GIS database structure deliverable (`docs/GIS-DATA-MODEL.md`) (stage 1.21)

## [2.6.0] — 2026-10-16

### Security

- Row-level security: in every tenant request the database itself returns only that tenant's assets, audit events and photos, even to a query with no tenant filter (stage 1.19)
- Two-factor authentication is mandatory for administrators of a tenant and of the platform, after a 14-day grace period from their next sign-in; field roles are not affected (stage 1.18)
- All app containers run as unprivileged users with no Linux capabilities; the web and admin containers listen on 8080 (stage 1.17)
- Request metrics (`/health/metrics`) are no longer reachable through the proxy (stage 1.17)
- The public iOS install page escapes release notes; encrypted settings require a full-length authentication tag; proxies forward a fixed Host header (stage 1.17)

### Changed

- Deploying 2.6.0: see DEPLOY.md, "Version 2.6.0: security changes to know before deploying" (stages 1.17–1.19)

## [2.5.0] — 2026-10-16

### Added

- Graded condition scale, 5 Excellent to 1 Unserviceable, with criteria per grade; each organisation and category can set its own under Administration → Condition Scale (stages 1.13–1.14)
- Condition history on the asset page, from `CONDITION_ASSESSED` events on the asset ledger (stages 1.13–1.14)
- Photo rules: a minimum number of photos per scanned asset by category; zone submission and `GET /api/v1/audits/:id/photo-warnings` list scans that fall short, without blocking (stage 1.13)
- Android and iOS audit screens grade condition 1–5 with the criteria shown, and prompt for a photo where the grade needs one (stage 1.15)

### Changed

- Every asset and scan carries a condition grade beside the condition string, each set from the other; existing records were graded from their strings (stage 1.13)
- The condition report counts by grade (stage 1.16)

## [2.4.0] — 2026-10-16

### Added

- Campaign layer on the asset map: choose a running or completed campaign to colour its assets verified, misplaced, condition variance, missing or not yet scanned, with surplus tags where they were scanned; a blind count in progress shows only progress (stage 1.10)
- "Pick on map" in the asset form: click the map or drag the pin to set a position (stage 1.11)
- Per-tenant base map: tile server, attribution, default centre and zoom under Administration → Map Settings (`GET/PUT /api/v1/gis/map-settings`); TUDA opens on Tbilisi (stage 1.12)

### Security

- Map attribution is plain text only and tile servers must use https, because the map renders attribution as HTML; changes are audited (stage 1.12)

## [2.3.0] — 2026-10-16

### Added

- Photos bound to audit scans: "Add photo to <tag>" on the Android and iOS audit screens; photos queue offline and upload once their scan is on the server, with the scan's position and capture time (stages 1.7–1.8)
- `POST /api/v1/audits/:id/scans/:scanRef/photos` (scan id or the device's clientRequestId) and `GET /api/v1/audits/:id/photos?locationId=`; blind campaigns hide matches until completed (stage 1.7)
- Capture time and GPS read from a photo's EXIF when the device sends none (stage 1.7)
- Scan photos on the web audit run and reconciliation pages, with time, position and a map link (stage 1.9)

### Changed

- A photo no longer needs an asset: a scan of an unknown tag can carry evidence (stage 1.7)

### Security

- Stored originals keep their metadata as evidence; every download stays stripped of EXIF and GPS (KFR-043, D13) (stage 1.7)

## [2.2.0] — 2026-10-16

### Added

- Audit scans carry the device position: both apps keep a recent GPS fix while an audit is open and attach it to each scan, including scans queued offline (stage 1.5)
- `GET /api/v1/audits/:id/scans/geo` returns a campaign's positioned scans as GeoJSON; blind campaigns hide results until completed; 404 while GIS is off (stage 1.5)
- Asset ledger events `POSITION_CAPTURED` (first position) and `POSITION_CORRECTED` (moved more than 1 m) (stage 1.5)
- Blind-audit snapshots record each asset's register position (stage 1.5)

### Changed

- A scan is never refused for its position: an unusable GPS reading is dropped and the scan kept, so offline work is not lost (stage 1.5)
- Scan recording moved to `audit-scan.service.ts`; `audit.service.ts` is 105 lines shorter (stage 1.5)

## [2.1.0] — 2026-10-16

### Added

- `GET /api/v1/assets/geo?bbox=minLon,minLat,maxLon,maxLat` returns the tenant's assets in the box as GeoJSON, with a `truncated` flag; 404 while GIS is off (stage 1.4)
- PostGIS: every asset's position is kept as a `geography` point with a spatial index, derived from latitude and longitude, and back-filled for assets placed before (stage 1.4)
- `/assets/map` and `/assets/geo` in the OpenAPI document (stage 1.4)

### Changed

- **Every database runs PostGIS** (`postgis/postgis:16-3.5-alpine`, D11). Existing servers switch once before deploying this version: see DEPLOY.md, "Switching an existing server to PostGIS" (stage 1.4)

## [2.0.1] — 2026-10-16

### Added

- Machine-enforced build rules: 500-line limit (with a shrink-only baseline for 16 older files), British English check, conventional commit messages, all in pre-commit hooks and CI (`npm run check`) (stage 0.10)
- Security job in CI: npm audit, Gitleaks, Trivy and Semgrep (OWASP Top Ten, new findings fail) (stage 0.10)
- Android unit tests and a new iOS build-and-test workflow in CI; API test results (JUnit) and coverage uploaded on every run (stage 0.10)
- Pull request template with the project's checklist (stage 0.10)

### Security

- Least-privilege workflow permissions and every action pinned by commit SHA (stage 0.10)
- Seven-day cooling-off for npm installs and Dependabot; Dependabot no longer raises major versions, which go through the decision log (stage 0.10)

## [2.0.0] — 2026-10-16

Adoption of the Managed Development Standard (decision D3). The major number marks the reset to one lockstep version; nothing in the API or data model is incompatible with 1.10.1 clients.

### Added

- Asset GIS positions: latitude, longitude, accuracy, source and capture time on every asset, set by hand, by GPS on the Android and iOS apps, or by import (stages 1.1–1.2)
- All-assets map in the web console, with the asset list's filters (stage 1.3)
- Delta sync (`GET /assets?changedSince=`) with "Last synced" on both apps, and per-user rate limits for scanner fleets (stage 0.4)
- Profile → Pending uploads on both apps: counts by state, Retry and confirmed Discard (stages 0.2–0.3)
- iOS background sync, photo uploads that survive going offline, and working blind audits (stage 0.3)
- Encrypted off-site backups, a restore test, migration-safe deploys and failure alerts (stage 0.5)
- TUDA tenant seed, standalone install stack and legacy register profiler (stage 0.6)
- One product version across npm, reports, Android and iOS, checked in CI (`npm run check:versions`), and this changelog (stage 0.9)
- `scripts/dev-setup.sh` generates local secrets from `.env.example` (stage 0.9)

### Changed

- **GIS is now a switchable module.** With the tenant's `gis` flag off (the default) the map returns 404, the web console and both apps hide position capture and display, and positions sent are ignored. Stored positions are kept and reappear when GIS is switched on. TUDA has GIS on (stage 0.9, D7)
- React Router 7, Tailwind 4, React 19, Prisma 7, Express 5, Node 24 LTS and other in-range updates (stages 0.x and earlier)
- `licence.service.ts` split by concern (PR #81)
- Releases go through a checked pull request (`go-live.sh`) instead of a push to `main`
- Android offline queue: no destructive database fallback; rejected scans are reported as rejected, not "Queued offline" (stage 0.2)

### Fixed

- Offline field work can no longer be lost silently on either app; online and queued calls share one idempotency key (stages 0.2–0.4)
- Wrong two-factor codes count towards the sign-in lockout; login writes are awaited
- Flaky API tests on macOS (supertest bound to 127.0.0.1) and audit writes racing test teardown

### Security

- Public auto-login page removed; demo password read from `SEED_DEMO_PASSWORD` and rotatable (KFR-037)
- Licence, tenant-scope and client-scope middleware mounted; alerts, exceptions and onboarding writes guarded; disabling two-factor needs a code (KFR-040–041)
- MinIO root credentials refused in production; MinIO built from source on the 2025-10-15 security release (KFR-042)
- EXIF and GPS metadata stripped from images on download and share (KFR-043)
- `APP_ENCRYPTION_KEY` of 32+ characters required in production (SEC-M6, KFR-035)
- nodemailer 10.0.15 and source-map-js 1.2.2 for published advisories

## [1.10.1] — 2026-08-05

### Fixed

- Saved label template layouts render on Android and iOS; Print button shown again (Android 36, iOS build 12)

## [1.10.0] — 2026-08-04

### Added

- Print saved label templates from the mobile apps

## [1.9.0 – 1.9.2] — 2026-08-01 to 2026-08-02

### Added

- RFID tag write and commissioning on HH83, Manufacturer EAN label (1.9.0)
- iOS "Check for Updates" in Profile → About (1.9.1)
- iOS device UDID captured and stored securely (1.9.2)

## [1.8.0 – 1.8.1] — 2026-08-01

### Added

- GS1 identity and label printing on Android and iOS (1.8.0)
- GS1 RFID EPCs resolved through `/assets/by-epc` (1.8.1)

## [1.7.0 – 1.7.3] — 2026-07-11 to 2026-07-21

### Added

- Offline mode: cached browsing, queued scans and offline asset creation (1.7.2)
- Show/hide on every password field (1.7.2)
- RFID scan experience release (1.7.0)

Earlier versions (1.4.x–1.6.x, June–July 2026) were Android-only releases recorded in the commit history.

[2.6.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/Snookylagoon/Vairiot/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Snookylagoon/Vairiot/compare/v1.10.1...v2.0.0
[1.10.1]: https://github.com/Snookylagoon/Vairiot/releases/tag/v1.10.1
