# Stage Log

A running record of every stage of Vairiot Asset Intelligence: what was done, what it produced and what was decided (standard §2.3, template §16.2). A new entry is added at the end of each stage. **Stage numbers are unique: check the last one before adding.**

Phase N is Sprint SN (decision D1). Stages 0.1–0.7 and 1.1–1.3 were done before the standard was adopted and are back-filled from `docs/sprints/S0-summary.md` and the commit history; they carry no version because the product version was not kept until 2.0.0.

---

## Phase 0 — Hardening and hosting (Sprint S0)

### Stage 0.1 — Audit triage and sprint baseline

| Item      | Detail                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| Date      | 5 October 2026                                                                 |
| Version   | —                                                                              |
| Activity  | Triaged the July 2026 platform audit into S0 work, later sprints and deferrals |
| Output    | `docs/sprints/S0-audit-triage.md`; commit `429f7b4`                            |
| Decisions | —                                                                              |
| Notes     | Branch `feature/s0-hardening` from `dev` at `16df41e`                          |

### Stage 0.2 — Android offline queue never loses field work

| Item     | Detail                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                                                              |
| Version  | —                                                                                                                           |
| Activity | One queue model (waiting, retrying, rejected); shared idempotency key online and offline; destructive Room fallback removed |
| Output   | Commit `0afbb4c`; Room migration 6 → 7; Profile → Pending uploads                                                           |

### Stage 0.3 — iOS offline parity; blind audits fixed

| Item     | Detail                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                            |
| Version  | —                                                                                         |
| Activity | Background sync, retry with backoff, offline photos; blind audits send zone and condition |
| Output   | Commit `56f4ae0`                                                                          |
| Notes    | iOS blind audits had been rejected on every attempt before this stage                     |

### Stage 0.4 — Server sync hardening, delta sync, iOS enrolment checks

| Item     | Detail                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                                                          |
| Version  | —                                                                                                                       |
| Activity | Per-user sync rate limits, gzip, `GET /assets?changedSince=`, duplicates resolved before the licence cap, SEC-H2 checks |
| Output   | Commits `9b193d8`, `e28eba2` (flaky macOS API tests fixed)                                                              |

### Stage 0.5 — Backups, restore test, safe deploys, alerts

| Item     | Detail                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Date     | 6 October 2026                                                                                              |
| Version  | —                                                                                                           |
| Activity | Encrypted off-site backups, isolated restore test, migration-first deploys, alerts; MinIO built from source |
| Output   | Commits `412145c`, `d68f8dd`; `infra/backup.sh`, `infra/restore-test.sh`, `infra/deploy.sh`                 |
| Notes    | Server activation steps are manual (DEPLOY.md)                                                              |

### Stage 0.6 — TUDA tenant, standalone install, register profiler

| Item     | Detail                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| Date     | 6 October 2026                                                                             |
| Version  | —                                                                                          |
| Activity | `seed:tuda` (with `gis`, `ipsas`, `reconciliation` on), standalone Compose stack, profiler |
| Output   | Commit `c51b080`; `infra/docker-compose.standalone.yml`, `scripts/profile-register.py`     |

### Stage 0.7 — Sprint close

| Item     | Detail                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Date     | 6 October 2026                                                                                                  |
| Version  | —                                                                                                               |
| Activity | Sprint summary and triage status; merged through PR #55                                                         |
| Output   | `docs/sprints/S0-summary.md`                                                                                    |
| Tests    | API 230/230; worker 5/5; shared 42/42; web 12/12; Android 62/62; iOS 41/41; profiler 17/17                      |
| Notes    | Open items listed in the summary §What remains open. Security follow-ups KFR-037–043 landed 14 October (PR #82) |

### Stage 0.8 — Standard adoption audit

| Item      | Detail                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Date      | 16 October 2026                                                                                                    |
| Version   | —                                                                                                                  |
| Activity  | Audited `main` at `9f0f8ee` against the Managed Development Standard §17; raised gaps G1–G20 and D1–D9             |
| Output    | `docs/standard-adoption-plan.md` (revision 0.2)                                                                    |
| Decisions | D1–D9 decided by the owner the same day: D3 alternative A (reset to 2.0.0); D4 deferred; the rest as recommended   |
| Notes     | Gitleaks over history found nothing, but it cannot read `docs/Demo Passwords.xlsx`, which holds passwords (G7, D4) |

### Stage 0.9 — Secrets, GIS behind its flag, versioning, documentation set (W0, W1a, W1, W2)

| Item      | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Version   | 2.0.0 (Android code 36 and iOS build 12 unchanged until the next distributed build: 37 / 13)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Activity  | **W0:** `.env.example` uses `change-me-…` placeholders (with `SEED_DEMO_PASSWORD`); `scripts/dev-setup.sh` generates them; `.env.*` ignored except templates; `.gitleaks.toml`. **W1a:** GIS behind `gis` — `requireFeature` guard (map 404), positions ignored when off, web/Android/iOS screens hidden, flags cached on both apps. **W1:** `scripts/bump-version.mjs` (`npm run check:versions`, in CI), every version file at 2.0.0, `vairiot-reports/pyproject.toml`, `CHANGELOG.md`, tag `v1.10.1` on `5ac4c88`. **W2:** `project.md`, this log, foundation documents 00–02, test plan, package READMEs, Word generator |
| Output    | API: `middleware/require-feature.ts`, `services/tenant-features.service.ts`, `resolveTenantAssetGeo`. Web: `hasFeature`, `RequireFeature`. Android: `data/FeatureFlags.kt`. iOS: `Data/FeatureFlags.swift`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests     | API full suite 321/321 in 34 suites (new `asset-gis-toggle.test.ts`); worker 5/5; shared 64/64; web 28/28 (new `hasFeature.test.ts`); Android unit tests pass; iOS 54/54 (new `FeatureFlagsTests`, `testNoPositionIsSentWhileGisIsOff`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Decisions | D3, D7 applied                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Notes     | Existing production tenants lose the GIS screens until `gis` is switched on for them. The web import page still offers latitude/longitude columns; the API ignores them while GIS is off. Tags not yet pushed                                                                                                                                                                                                                                                                                                                                                                                                                |

### Stage 0.10 — Enforcement and CI (W3)

| Item      | Detail                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                                                                              |
| Version   | 2.0.1                                                                                                                                                                                                                                                                                                                        |
| Activity  | Copied and adapted from Vairiot CI: `check-line-limits.sh` (with `line-limit-baseline.txt`, 16 files, shrink-only), `check-british-english.mjs` (skips CSS and Tailwind names), Husky `pre-commit` and `commit-msg`, `commitlint.config.mjs`, `.editorconfig`, PR template, `npm run check`. `.npmrc` `min-release-age=7`; Dependabot `cooldown` 7 days and majors ignored. CI: top-level `permissions: contents: read`, concurrency, every action pinned by SHA, timeouts on every job, line and spelling checks, `security` job (npm audit, Gitleaks 8.30.1, Trivy 0.75.0, Semgrep 1.179.0 with a merge-base baseline), JUnit and coverage artefacts, Android unit tests, new `ios.yml` |
| Output    | `scripts/check-line-limits.sh`, `scripts/line-limit-baseline.txt`, `scripts/check-british-english.mjs`, `.husky/`, `commitlint.config.mjs`, `.editorconfig`, `.trivyignore`, `.github/pull_request_template.md`, `.github/workflows/{ci,android,ios}.yml`, `.github/dependabot.yml`                                          |
| Tests     | `npm run check` passes (0 lint errors, 75 warnings as before); worker 5/5, shared 64/64, web 28/28; npm audit (high) clean; Gitleaks clean; Trivy clean with the DS-0002 ignore; Semgrep 62 existing findings triaged as G27                                                                                                 |
| Decisions | D10 approved: defect severities Sev1–Sev4                                                                                                                                                                                                                                                                                    |
| Notes     | Lint-staged runs ESLint only, because Prettier would reformat 315 of 334 sources (G28). The iOS workflow and the security job have not yet run on GitHub (G29). Phase 0 is ready for owner acceptance                                                                                                                        |

---

## Phase 1 — GIS, condition and photos (Sprint S1)

Started before Phase 0 was accepted, so stages 1.1–1.3 come before the hand-over in time. New work continues from stage 1.4.

### Stage 1.0 — Phase 0 accepted; Phase 1 planned

| Item      | Detail                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                |
| Version   | 2.0.1                                                                                                                                                                                          |
| Activity  | Owner accepted Phase 0 ("Do 1, 2 and 3"), open points handled as proposed. Sprint files amended: SemVer from 2.0.0 instead of the fixed 2.0.0-pilot / 2.1.0 / 2.2.0 plan, `dev` instead of `develop` (G22), Leaflet instead of MapLibre (G25). Phase 1 plan written |
| Output    | `docs/03-phase-1-plan.md`; `docs/sprints/README.md`, `S1`–`S5` amended; `project.md` decision log                                                                                             |
| Decisions | Phase 0 acceptance recorded; D11 (PostGIS image) and D12 (Leaflet) raised as proposed                                                                                                          |
| Notes     | Tags `phase-0-accepted` and `v2.0.1` wait for the promotion of `dev` to `main`. PRs #85 and #86 await the owner's merge: this session's permissions do not allow merging without review |

### Stage 1.1 — GIS position module for assets (S1.1, part)

| Item     | Detail                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Date     | 12 October 2026                                                                                        |
| Version  | —                                                                                                      |
| Activity | Latitude, longitude, accuracy, source, capture time on `Asset`; validation in `vairiot-shared/src/geo` |
| Output   | Commit `5f78644`; migration `20261012000000_asset_gis_position`                                        |
| Notes    | PostGIS, scan-event positions and the source CRS from the S1.1 prompt are not built yet                |

### Stage 1.2 — GPS capture in the Android and iOS apps (S1.2)

| Item     | Detail                                                   |
| -------- | -------------------------------------------------------- |
| Date     | 12 October 2026                                          |
| Version  | —                                                        |
| Activity | Capture, display and offline queueing of asset positions |
| Output   | Commit `98def6b`                                         |

### Stage 1.3 — All-assets map view (S1.4)

| Item     | Detail                                                   |
| -------- | -------------------------------------------------------- |
| Date     | 12 October 2026                                          |
| Version  | —                                                        |
| Activity | `GET /assets/map`, clustered map page in the web console |
| Output   | Commit `10ad7ba`; merged through PR #70                  |

### Stage 1.4 — PostGIS foundation (W1, S1.1 rest)

| Item      | Detail                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                              |
| Version   | 2.1.0                                                                                                                                                                                                                                        |
| Activity  | Every Compose stack, the restore test and CI on `postgis/postgis:16-3.5-alpine` (`POSTGIS_IMAGE` override for ARM). Migration `20261016000000_postgis_asset_geom`: extension, `assets.geom geography(Point,4326)` set by trigger from latitude/longitude, back-fill, GIST index. `GET /assets/geo?bbox=` GeoJSON behind `gis`. OpenAPI GIS paths in `lib/openapi-gis.ts`, merged in `lib/api-spec.ts` so the baselined `openapi.ts` does not grow. DEPLOY.md: one-off switch procedure for existing servers |
| Output    | `services/asset-geo-query.service.ts`, `lib/openapi-gis.ts`, `lib/api-spec.ts`, schema `geom` (`Unsupported`, GIST index)                                                                                                                    |
| Tests     | API full suite 330/330 in 35 suites on PostGIS (new `asset-geo-bbox.test.ts`: trigger, box, tenancy, truncation, 400s, 404 with `gis` off, OpenAPI)                                                                                         |
| Decisions | D11 and D12 raised (approved by the owner on 16 October 2026, after this stage)                                                                                                                                       |
| Notes     | Not deployed. `prisma migrate diff` shows drift that predates this stage (`asset_events` index and `hash` default), not caused by `geom`; to be reconciled in a later stage. Scan positions and `Location.boundary` move to W2 |

### Stage 1.5 — Scan positions and position events (W2, S1.1 step 3, S1.2)

| Item      | Detail                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                        |
| Version   | 2.2.0                                                                                                                                                                                                                                                                  |
| Activity  | Migration `20261016010000_scan_positions`: generic `sync_geom_from_lat_lon()` trigger; position columns, checks, `geom` and GIST index on `audit_scan_events`; register position on `audit_snapshot_assets`; `POSITION_CAPTURED` / `POSITION_CORRECTED` ledger events. API: scans accept a position (dropped, never refused, when unusable; ignored with GIS off); `GET /audits/:id/scans/geo`. Android and iOS: `ScanPositionTracker` refreshes a fix every 20 s while an audit is open and attaches it to each scan if under 60 s old; Android Room v9 and a one-time location permission prompt on the audit screen; iOS SwiftData lightweight migration |
| Output    | `services/audit-scan.service.ts` (moved out of `audit.service.ts`), `recordPositionEvent` in `asset-geo.service.ts`, `distanceMetres` in `vairiot-shared`; Android `location/ScanPositionTracker.kt`, `ui/components/LocationPermissionPrompt.kt`, `data/api/AuditScanModels.kt`; iOS `Location/ScanPositionTracker.swift` |
| Tests     | API 338/338 in 36 suites (new `audits/scan-positions.test.ts`); shared geo 24/24; Android unit tests pass (new `ScanPositionTrackerTest`, recorder position test); iOS 58/58 (new `ScanPositionTrackerTests`)                                                       |
| Decisions | D11 and D12 approved by the owner                                                                                                                                                                                                                                       |
| Notes     | The line-limit check caught `ApiModels.kt` growing; `RecordScanRequest` moved to its own file. Baseline tightened: `audit.service.ts` 591, `asset.service.ts` 569, `ApiModels.kt` 528. Not checked on a Meferi device outdoors (S1.2 gate needs a field test). `Location.boundary` left for S3 |

### Stage 1.6 — Adoption merged into dev; branches and worktrees cleaned (G20)

| Item     | Detail                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date     | 16 October 2026                                                                                                                                                                                              |
| Version  | 2.2.0 (on `dev`; production unchanged until `go-live.sh`)                                                                                                                                                    |
| Activity | PRs #85 (2.0.0), #86 (2.0.1), #87 (2.1.0) and #88 (2.2.0) merged into `dev` in order with merge commits, each on a green pipeline. Six stale worktrees removed; 17 local and 18 remote merged branches deleted |
| Tests    | Every PR: 12/12 checks, including the first runs of the Security and iOS jobs (#86) and the API suite on PostGIS in CI (#87, #88)                                                                           |
| Notes    | `dev` has no branch protection, so auto-merge was not available; merges were made once each pipeline was green. 20 Dependabot branches remain for adoption W6 (tidy-up). Tags `v2.2.0` and `phase-0-accepted` wait for the promotion to `main`, which first needs the PostGIS switch in DEPLOY.md |

### Stage 1.7 — Photos bound to audit scans: API (W3, S1.3 steps 1–3)

| Item      | Detail                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                              |
| Version   | — (released with W3)                                                                                                                                                                                                                                                         |
| Activity  | Migration `20261016020000_scan_photos`: `photos.assetId` nullable (a scan of an unknown tag), scan, campaign, position, capture time, device and `photoType`, with checks that every photo has an owner. `POST /audits/:id/scans/:scanRef/photos` (scan id or the device's clientRequestId), `GET /audits/:id/photos?locationId=`. Pure-TypeScript JPEG EXIF reader for capture time (GPS UTC stamp, or DateTimeOriginal with its offset) and GPS. Position: sent value, else EXIF, else the scan's |
| Output    | `services/scan-photo.service.ts`, `routes/audits/audit-photos.router.ts`, `lib/image-metadata/exif-read.ts`, `lib/openapi-photos.ts`                                                                                                                                         |
| Tests     | Photo suites 32/32 (new `photos/exif-read.test.ts`, `audits/scan-photos.test.ts`: EXIF in both byte orders, time precedence, fallbacks, cap of 4, unknown tag, blind hiding, zone filter, GIS off, download stripped)                                                       |
| Decisions | D13 raised (keep KFR-043: originals as evidence, strip on egress)                                                                                                                                                                                                             |
| Notes     | Server-side thumbnails and the burned-in stamp are not built (Phase 1 plan §2.2). Mobile capture, `PhotoRule` and the web gallery follow                                                                                                                                     |

### Stage 1.8 — Photos bound to audit scans: Android and iOS (W3, S1.3 step 5)

| Item     | Detail                                                                                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                                                                                |
| Version  | — (released with W3)                                                                                                                                                                                                                                           |
| Activity | "Add photo to <tag>" on the audit run screen of both apps, for the last accepted or queued scan. Photos always go through the photo queue, keyed to the scan's clientRequestId, and upload only once that scan has left the scan queue; the scan's fix and the capture time travel as form fields (compressed or picker images carry no EXIF). Android Room v10; iOS SwiftData lightweight migration; iOS upload sends text fields |
| Output   | Android `ui/screens/AuditMessages.kt` (message area moved out of `AuditRunScreen.kt`, now 551 lines), `ScanPhotoUploader`, `uploadScanPhoto`; iOS `Screens/Audits/ScanPhotoButton.swift`, `Components/ImageThumbnail.swift`, `SyncAPI.uploadScanPhoto`            |
| Tests    | Android unit tests pass (new `ScanPhotoQueueTest`: waits for its scan, sends fields, asset photos unchanged, offline stays queued); iOS 60/60 (new `ScanPhotoQueueTests`)                                                                                    |
| Notes    | Not tried on a device camera. Baseline tightened: `AuditRunScreen.kt` 551, `AuditRunView.swift` 528                                                                                                                                                             |

### Stage 1.9 — Scan photos on the web; W3 released (W3, S1.3 step 7)

| Item     | Detail                                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                          |
| Version  | 2.3.0                                                                                                                                                                                                    |
| Activity | `ScanPhotoGallery` on the audit run and reconciliation pages: thumbnails, a lightbox with tag, capture time (en-GB) and position with accuracy, and an OpenStreetMap link; hidden when a campaign has no photos |
| Output   | `vairiot-web/src/components/audits/ScanPhotoGallery.tsx`                                                                                                                                                  |
| Tests    | Web 32/32 (new `ScanPhotoGallery.test.tsx`); API 352/352 in 38 suites; Android and iOS as in stage 1.8                                                                                                             |
| Notes    | `PhotoRule` moved to W5 with the condition scale. Burned-in stamp and server thumbnails not built (plan §2.2). D13 approved by the owner the same day; the S1.3 gate reworded to match                                                                         |

### Stage 1.10 — Campaign layer on the asset map (W4, S1.4 step 2)

| Item     | Detail                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                                         |
| Version  | — (released with W4)                                                                                                                                                                                                    |
| Activity | `GET /audits/:id/map`: expected assets in state verified, misplaced, condition variance, missing or not yet scanned (live from the scans; a completed blind campaign uses its reconciliation), surplus tags at their scan position; a blind count in progress shows only scanned / not scanned. Asset map: campaign selector, state colours and legend |
| Output   | `services/campaign-map.service.ts`; web `lib/campaignMap.ts`, `hooks/useCampaignMap.ts`; `AssetClusterMap` `colourOf`                                                                                                   |
| Tests    | `audits/campaign-map.test.ts` (states, surplus de-duplication, scan fallback, blind progress only, 404s); web campaign layer test                                                                                        |

### Stage 1.11 — Set a position on the map (W4, S1.4 step 3)

| Item     | Detail                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                |
| Version  | — (released with W4)                                                                                                                           |
| Activity | "Pick on map" in the asset form: a Leaflet map where a click or a drag of the pin sets the position as manual; the ledger records the move (stage 1.5) |
| Output   | `components/geo/PositionPickerMap.tsx`                                                                                                         |
| Tests    | Web `MapSettings.test.tsx` (pick sets a manual position)                                                                                       |
| Notes    | No reason note (assets have no field for one)                                                                                                  |

### Stage 1.12 — Per-tenant base map; W4 released (W4, S1.4 step 5)

| Item     | Detail                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                |
| Version  | 2.4.0                                                                                                                                                                                          |
| Activity | Migration `20261016030000_tenant_map_settings`. `GET/PUT /gis/map-settings` behind `gis`: https tile URL with `{z}/{x}/{y}`, plain-text attribution (Leaflet renders it as HTML), centre and zoom; writes need `company:manage` and are audited. Both web maps use it; Map Settings page; TUDA seeds a Tbilisi centre |
| Output   | `lib/map-settings.ts`, `routes/gis/gis.router.ts`; web `hooks/useBaseMap.ts`, `pages/admin/MapSettingsPage.tsx`                                                                                |
| Tests    | API 362/362 in 40 suites (new `gis/map-settings.test.ts`); web 35/35                                                                                                                          |
| Notes    | Playwright smoke not built (G30). No CSP exists to allow the tile host (G31)                                                                                                                   |

### Stage 1.13 — Condition scale, grades, events and photo rules: API (W5, S1.5 steps 1–3, S1.3 step 6)

| Item     | Detail                                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                                                                                                        |
| Version  | — (released with W5)                                                                                                                                                                                                                                                                   |
| Activity | Migration `20261016040000_condition_scale`: `conditionGrade` on assets and scans, back-filled from the strings; `condition_scale_entries` (tenant scale and category overrides) and `photo_rules`. Grade and string set from each other (`vairiot-shared` `conditionColumns`). `CONDITION_ASSESSED` on the ledger when the grade changes (a default "good" on create is not an assessment). `GET/PUT /condition/scale`, `GET/PUT /condition/photo-rules` (company:manage, audited); `GET /audits/:id/photo-warnings`; zone submission returns `photoWarnings` without blocking |
| Output   | `vairiot-shared` `constants/condition.constants.ts`; `services/condition.service.ts`, `services/asset-change-events.service.ts`, `routes/condition/condition.router.ts`, `lib/openapi-condition.ts`                                                                                    |
| Tests    | `condition/condition-scale.test.ts` (default, tenant, category override and removal, bad scales, permissions, grade/string sync, ledger events, 400 for bad grades, warnings, zone submission); shared `condition.test.ts`                                                              |

### Stage 1.14 — Condition scale on the web (W5, S1.5 steps 3–4)

| Item     | Detail                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                     |
| Version  | — (released with W5)                                                                                                                                |
| Activity | Condition picker in the asset form from the tenant's or category's scale, with criteria; condition history on the asset page; Administration → Condition Scale (scale per category, photo rules) |
| Output   | `components/forms/ConditionSelect.tsx`, `components/assets/ConditionHistory.tsx`, `pages/admin/ConditionScalePage.tsx`, `hooks/useCondition.ts`       |
| Tests    | Web `Condition.test.tsx`                                                                                                                            |

### Stage 1.15 — Graded condition in the apps (W5, S1.5 step 5)

| Item     | Detail                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date     | 16 October 2026                                                                                                                                                          |
| Version  | — (released with W5)                                                                                                                                                     |
| Activity | Audit screens on Android and iOS: grade 1–5 from the tenant's scale (built-in scale offline) with criteria; grade queued with the scan; a grade needing a photo prompts for one. Android Room v11 |
| Output   | Android `ui/screens/ConditionGradePicker.kt`, `domain/model/ConditionScale.kt`; iOS `Screens/Audits/ConditionGradePicker.swift`, `Models/ConditionScale.swift`               |
| Tests    | Android unit tests pass (recorder grade test); iOS 63/63 (new `ConditionGradeTests`)                                                                                     |
| Notes    | The asset edit screens still offer the condition strings; the API derives the grade. Baseline tightened: `AuditRunScreen.kt` 525, `AuditRunView.swift` 518                |

### Stage 1.16 — Condition report by grade; W5 released (W5, S1.5 step 6)

| Item     | Detail                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                        |
| Version  | 2.5.0                                                                                                                                  |
| Activity | The condition report counts by grade, so legacy strings such as "excellent" are counted; headers name the grades                       |
| Tests    | API 371/371 in 42 suites (new `reports/condition-report.test.ts`); web 39/39                                                           |
| Notes    | Report headers use the default labels, not a tenant's own. `reconciliation_detail.py` unchanged: condition variance compares the strings, which follow the grade |

### Stage 1.17 — Non-root containers, metrics, Semgrep triage (W6, G16, G27)

| Item     | Detail                                                                                                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                                                                                             |
| Version  | — (released with W6)                                                                                                                                                                                                                                                        |
| Activity | API and worker run as `node`, reports as `app` (10001), web and admin on the unprivileged nginx (uid 101, port 8080) with upstreams, ports and healthchecks moved; app containers drop all capabilities and set `no-new-privileges`. `/health/metrics` refused at every proxy. Proxies forward a constant `Host`; dev passes only WebSocket upgrades. The public install page escapes release data. AES-GCM decryption requires a 16-byte tag. Remaining Semgrep matches annotated with reasons; Trivy no longer ignores DS-0002 |
| Tests    | Images built and run unprivileged (web uid 101 serving on 8080, reports uid 10001 healthy, API uid 1000 writes `/tmp` and runs the Prisma CLI); Trivy and Semgrep clean on the tree; new `security/w6-hardening.test.ts`                                                    |
| Notes    | MinIO still runs as root over root-owned data (G32)                                                                                                                                                                                                                          |

### Stage 1.18 — Mandatory two-factor for administrators (W6, D6, G15)

| Item     | Detail                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date     | 16 October 2026                                                                                                                                                                                              |
| Version  | — (released with W6)                                                                                                                                                                                         |
| Activity | Platform Super Admin, Licensing Authority, Company Admin and the Administrator tenant role must use two-factor; field roles excluded. Migration `20261016050000_two_factor_grace`; the first sign-in starts a grace period (`TWO_FA_GRACE_DAYS`, default 14) shown at sign-in, in `/auth/me` and as a banner in both consoles; after it, sign-in goes through enrolment and refreshes are refused |
| Tests    | `security/two-factor-mandatory.test.ts`; `security.test.ts` updated from the opt-in policy; web `TwoFactorDueBanner.test.tsx`                                                                                 |

### Stage 1.19 — Row-level security on the first tables; W6 released (W6, D5, G13)

| Item     | Detail                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 16 October 2026                                                                                                                                                                                                                                                                                |
| Version  | 2.6.0                                                                                                                                                                                                                                                                                          |
| Activity | Migration `20261016060000_row_level_security`: role `vairiot_rls`, FORCE row-level security and a `tenant_isolation` policy on `assets`, `audit_events`, `photos`; identifier functions `SECURITY DEFINER`. `lib/rls-pool.ts` sets each checked-out connection for the request (role and `app.tenant_id`); `lib/tenant-context.ts` scopes gated requests except platform administration and sub-tenant management; the family asset counts cross tenants explicitly. The API refuses to start without the role; `infra/restore.sh` creates it before restoring |
| Tests    | API 386/386 in 45 suites (new `security/row-level-security.test.ts`: unfiltered and raw reads, the restricted role, refused cross-tenant writes, transactions, unscoped paths, no leak between checkouts, startup check); web 41/41                                                           |
| Decisions | D5 applied                                                                                                                                                                                                                                                                                    |
| Notes    | Found while building: the login role is the superuser, which bypasses RLS even with FORCE, hence the role switch; Prisma queries are lazy, so a scope must await inside it. The other tenant tables follow (G23)                                                                                |


### Stage 1.20 — Playwright map smoke with the API mocked (W7, G30, S1.4 step 6)

| Item      | Detail                                                                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                         |
| Version   | — (no product change)                                                                                                                                                                                                                   |
| Activity  | `@playwright/test` 1.64.0 in `vairiot-web`; Vite on port 4173 with the API mocked by `page.route` and blank map tiles. The map smoke loads 42 Tbilisi assets as one cluster of 40 and two single markers, opens an asset card, splits the cluster by clicking it, recolours the markers by count state when a campaign is chosen, and is not offered with `gis` off. CI job `e2e-web` (type-check, Chromium, report artefact) |
| Output    | `vairiot-web/playwright.config.ts`, `vairiot-web/e2e/{fixtures.ts,asset-map.smoke.ts,tsconfig.json}`; `test:e2e` script                                                                                                                 |
| Tests     | Playwright 5/5, stable over three repeats; web 41/41                                                                                                                                                                                    |
| Decisions | G30 handled as proposed: mocked API first                                                                                                                                                                                               |
| Notes     | The TUDA seed has no assets, so the fixture stands in for the register. Dragging a marker (also in the S1.4 gate) stays covered by Vitest and the API ledger test. The Docker-stack run is still to come                              |

### Stage 1.21 — Exit gate on the Docker stack; Phase 1 record (W7, S1.6)

| Item      | Detail                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                                              |
| Version   | 2.6.1                                                                                                                                                                                                                                                                                        |
| Activity  | Exit gate (test plan §8.2) on the production images with the standalone overlay, behind nginx with TLS, as a throwaway project on a fresh database seeded with `seed:tuda`: 15/15 checks over HTTPS (migrations, bbox GeoJSON, position events, scan photo time and position from EXIF, stripped download and kept original, grades, report, `gis` toggle). Playwright `asset-map.stack.ts` signs in and checks the map against the API. The register profiler was run on the stack's export. nginx healthcheck fixed (KFR-044). Phase 1 record, S1 summary, GIS data model, field checks P1.1–P1.2 and the Word report written |
| Output    | `docs/04-phase-1-record.md`, `docs/sprints/S1-summary.md`, `docs/GIS-DATA-MODEL.md`, `docs/word/build_phase1.py`, `docs/word/Vairiot-AI-Phase-1-GIS-Condition-Photos.docx`; `vairiot-web/playwright.stack.config.ts`, `e2e/asset-map.stack.ts`; `security/compose-healthchecks.test.ts`      |
| Tests     | API 388/388 in 46 suites; web 41/41; Playwright 5/5 (mocked) and 1/1 (stack); shared 69/69; worker 5/5; scripts 17/17; Android 79/79; iOS 63/63; `npm run check` passes                                                                                                                       |
| Decisions | G30 closed. G33 (export and profiler lack the new columns) and G34 (form labels not tied to inputs) raised                                                                                                                                                                                   |
| Notes     | The S1.2 Meferi field check and the S1.5 photo prompt on a device are outstanding (P1.1, P1.2). Found by the gate: nginx stayed unhealthy because `localhost` now resolves to IPv6 first. On ARM the gate needs `POSTGIS_IMAGE=imresamu/postgis:16-3.5-alpine`. Phase 1 awaits owner acceptance |

### Stage 1.22 — Phase 1 accepted

| Item      | Detail                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                         |
| Version   | 2.6.1                                                                                                                                                                   |
| Activity  | Owner accepted Phase 1: "I accept Phase 1. The field checks P1.1 and P1.2 can follow and be recorded when done." Record, plan and project brief updated                  |
| Output    | `docs/04-phase-1-record.md` §7; `project.md` decision log                                                                                                               |
| Decisions | Phase 1 acceptance recorded, with P1.1 and P1.2 as follow-ups                                                                                                           |
| Notes     | Tag `phase-1-accepted` waits for the promotion of `dev` to `main`, with `phase-0-accepted` and the 2.x tags. PR #93 carries stages 1.20–1.22 and the Phase 2 plan (stage 2.0) |
