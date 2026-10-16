# Changelog

All notable changes to Vairiot Asset Intelligence, newest first. One product version covers every package, service and app (standard §8.1). Each line ends with the stage it came from; entries before 2.0.0 are back-filled from the commit history and predate stage numbering.

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

[2.0.0]: https://github.com/Snookylagoon/Vairiot/compare/v1.10.1...v2.0.0
[1.10.1]: https://github.com/Snookylagoon/Vairiot/releases/tag/v1.10.1
