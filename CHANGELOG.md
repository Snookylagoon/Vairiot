# Changelog

All notable changes to Vairiot Asset Intelligence, newest first. One product version covers every package, service and app (standard §8.1). Each line ends with the stage it came from; entries before 2.0.0 are back-filled from the commit history and predate stage numbering.

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

[2.2.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Snookylagoon/Vairiot/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/Snookylagoon/Vairiot/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Snookylagoon/Vairiot/compare/v1.10.1...v2.0.0
[1.10.1]: https://github.com/Snookylagoon/Vairiot/releases/tag/v1.10.1
