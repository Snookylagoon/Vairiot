# Phase 1 — GIS, Condition and Photos (Record)

| Item       | Detail                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 (Sprint S1, decision D1)                                                                                     |
| Status     | **Accepted** by the owner on 16 October 2026 (stage 1.22); field checks P1.1 and P1.2 follow (§3)               |
| Revision   | 0.1 (16 October 2026)                                                                                          |
| Version    | 2.6.1 (on `dev`; production unchanged until promotion, §5)                                                     |
| Plan       | [Phase 1 plan](03-phase-1-plan.md) · [S1 sprint](sprints/S1-gis-condition-photos.md)                           |
| Summary    | [S1 summary](sprints/S1-summary.md): what changed, how to verify, open items, full file list                   |
| Deliverable | [GIS data model](GIS-DATA-MODEL.md): TOR Deliverable D4                                                      |
| Stages     | 1.0–1.21 ([stage log](stage-log.md))                                                                           |

## 1. Workstreams

| #   | Workstream                    | Stages     | Release | Result |
| --- | ----------------------------- | ---------- | ------- | ------ |
| W0  | Hand-over                     | 1.0        | 2.0.1   | Phase 0 accepted, this phase planned, D11–D13 approved |
| W1  | PostGIS foundation            | 1.4        | 2.1.0   | PostGIS in every stack, `assets.geom` by trigger, bounding-box GeoJSON |
| W2  | Scan positions                | 1.5        | 2.2.0   | Positions on audit scans from both apps; position ledger events |
| W3  | Photo bound to scan           | 1.7–1.9    | 2.3.0   | Scan photos with EXIF time and position; both apps; web gallery |
| W4  | Map extensions                | 1.10–1.12  | 2.4.0   | Campaign layer, pick on map, per-tenant base maps |
| W5  | Condition scale               | 1.13–1.16  | 2.5.0   | Graded scale, events, photo rules; web, apps and report |
| W6  | Security (first part)         | 1.17–1.19  | 2.6.0   | Non-root containers, mandatory two-factor, row-level security on three tables |
| W7  | Phase close                   | 1.20–1.21  | 2.6.1   | Playwright, exit gate on the Docker stack, nginx healthcheck fix, this record |

Stages 1.1–1.3 (position columns, GPS capture in the apps, the first map) were built before the standard was adopted, in PR #70.

## 2. Exit gate (test plan §8.2)

Run on 16 October 2026 against the production images (`docker-compose.prod.yml` with the standalone overlay used for TUDA), behind nginx with TLS, on a fresh database. It ran as a throwaway project with its own volumes and ports, and the TUDA tenant was seeded with `seed:tuda`. The API was driven over HTTPS through nginx, and the browser checks ran in Playwright Chromium.

### 2.1 Gate results

| Gate | Check on the stack | Result |
| ---- | ------------------ | ------ |
| S1.1 Location model | 45 migrations applied to an empty database; PostGIS 3.5.3 | **Pass** |
| | `GET /api/v1/assets/geo?bbox=44.7,41.6,44.9,41.8` returns a GeoJSON `FeatureCollection` of the 12 Tbilisi assets, without the Kutaisi asset or the one without a position | **Pass** |
| | A reversed bounding box is refused (400); `geom` agrees with latitude and longitude on every row | **Pass** |
| S1.2 Mobile GPS | API side: scans carry positions (S1.3 row below, `audits/scan-positions.test.ts`); apps: unit tests with a fake location provider (Android 79/79, iOS 63/63) | **Pass** (automated) |
| | An asset created outdoors on a Meferi stores a position with accuracy | **Outstanding**: field check P1.1 (§3) |
| S1.3 Scan photos | A photo taken during an audit is listed against its scan with the EXIF capture time (`2026-10-16T08:30:15Z` from `12:30:15 +04:00`) and the EXIF position | **Pass** |
| | The downloaded copy has no EXIF GPS; the original in MinIO keeps it as evidence (D13) | **Pass** |
| S1.4 Map | Playwright on the stack: signed in as the TUDA administrator, `/assets/map` draws every positioned asset the API returns, clustered | **Pass** |
| | Playwright with the API mocked (CI): 42 assets as one cluster of 40 and two markers; a cluster click splits it; choosing a campaign recolours markers (verified green, missing red) | **Pass** |
| | Moving an asset writes `POSITION_CORRECTED` after `POSITION_CAPTURED`; `/assets/map` counts the asset without a position | **Pass** |
| S1.5 Condition scale | An asset written with condition "poor" gets grade 2; every asset in the tenant has a grade | **Pass** |
| | The condition report exports by grade through the reports service | **Pass** |
| | Grade 2 on a device prompts for a photo | **Outstanding**: field check P1.2 (§3); the grade picker is covered by unit tests on both apps |
| S1 toggle | With `gis` off, `/assets/map`, `/assets/geo` and `/gis/map-settings` answer 404; a position sent while off is ignored; on again, every position is unchanged (checksum) | **Pass** |

15 of 15 automated stack checks passed, and both Playwright suites passed. Two gate conditions need a person with a device outdoors.

### 2.2 Suites

| Suite | Result |
| ----- | ------ |
| API (Jest, PostGIS and Redis) | 388/388 in 46 suites (386 before this stage, plus the 2 tests in `security/compose-healthchecks.test.ts`) |
| Web (Vitest) | 41/41 |
| Web browser (Playwright, API mocked) | 5/5, stable over three repeats |
| Web on the stack (Playwright) | 1/1 |
| Shared | 69/69 · Worker 5/5 · Scripts (profiler) 17/17 |
| Android unit tests | 79/79 |
| iOS unit tests | 63/63 |
| `npm run check` | Line limits, British English, versions, ESLint (0 errors, 75 warnings as before), type-check: pass |

### 2.3 Found by the gate

| Finding | Handling |
| ------- | -------- |
| **nginx never became healthy.** Its healthcheck fetched `http://localhost/nginx-health`. The current `nginx:alpine` resolves `localhost` to `::1` first, and every site listens on IPv4 only. `deploy.sh` waits for every container to be healthy, so a deploy with a fresh nginx image would time out. | Fixed: the check uses `127.0.0.1` (KFR-044, `security/compose-healthchecks.test.ts`). Patch release 2.6.1 |
| The register export has Latitude and Longitude, but not the grade, the accuracy or the position source. The profiler (S0.6) leaves Latitude and Longitude unmapped. | Open point G33, for the S2 import and export work |
| The login form's labels are not tied to their inputs, so screen readers do not announce them. Playwright finds the fields by placeholder. | Open point G34, for the S3 accessibility work |

## 3. Field checks outstanding

| Check | Gate | Procedure |
| ----- | ---- | --------- |
| P1.1 An asset created outdoors keeps its position; offline scans sync with theirs | S1.2 | [manual-checks.md](testing/manual-checks.md) "Phase 1 field checks" |
| P1.2 Grade 2 on an audit scan prompts for a photo, which appears against the scan | S1.5 | Same |

Both need a staging or TUDA build with `gis` on. The owner accepted Phase 1 with these as follow-ups (§7); each is recorded in the stage log when done.

## 4. Decisions

| #   | Decision | Status |
| --- | -------- | ------ |
| D5  | Row-level security table by table, starting with `Asset`, `AuditEvent`, `Photo` | Applied (stage 1.19) |
| D6  | Mandatory two-factor for administrators with a 14-day grace | Applied (stage 1.18) |
| D11 | `postgis/postgis:16-3.5-alpine` everywhere | Applied (stage 1.4) |
| D12 | Leaflet for web maps | Applied (stages 1.3, 1.10–1.12) |
| D13 | Originals keep metadata as evidence; every copy leaving the API is stripped | Applied (stages 1.7–1.9); confirmed on the stack (§2.1) |
| G30 | Browser tests: Playwright against the mocked API first, then the Docker stack | Applied (stages 1.20–1.21); the stack run is a manual step before a release |

## 5. Release status

- `dev` carries 2.6.1. Production still runs the stack from before 2.0: promoting `dev` to `main` needs the PostGIS image switch, with a backup and restore test before it ([DEPLOY.md](../DEPLOY.md)).
- Tags `phase-0-accepted`, `v2.0.1`–`v2.6.1` and, on acceptance, `phase-1-accepted` wait for that promotion.
- Before deploying 2.6.x, read DEPLOY.md "Version 2.6.0: security changes to know before deploying" (unprivileged ports, two-factor grace, the `vairiot_rls` role).

## 6. Open points carried into Phase 2

| #   | Point | Proposed handling |
| --- | ----- | ----------------- |
| G23 | Row-level security covers 3 of the tenant tables | Phase 2 security workstream, table by table |
| G28 | Prettier not applied across the codebase | One formatting commit at a quiet point |
| G31 | No Content-Security-Policy | Phase 2 security; must allow the tenant's tile host |
| G32 | MinIO runs as root | One-off `chown` per server, then `USER` |
| G33 | Export and profiler lack the new position and grade columns | S2 import and export |
| G34 | Login labels not tied to inputs | S3 accessibility (axe in Playwright) |
| —   | `altitudeM`, `gisFeatureId`, `gisLayer`, `sourceCrs`; national grid; zone polygons | S5 GIS exchange; S3 zones |
| —   | Burned-in photo stamp; server thumbnails | Deferred (plan §2.2) |
| —   | Schema drift predating stage 1.4 (`asset_events` index, `hash` default) | A Phase 2 migration |

## 7. Acceptance

| Item | Detail |
| ---- | ------ |
| Requested | 16 October 2026, with this record, the [S1 summary](sprints/S1-summary.md), the [GIS data model](GIS-DATA-MODEL.md) and the Word report `docs/word/Vairiot-AI-Phase-1-GIS-Condition-Photos.docx` |
| Owner decision | **Accepted**, 16 October 2026: "I accept Phase 1. The field checks P1.1 and P1.2 can follow and be recorded when done." |
| Follow-ups | Field checks P1.1 and P1.2, recorded in the stage log when done; tag `phase-1-accepted` at the promotion of `dev` to `main` |
| Next | [Phase 2 plan](05-phase-2-plan.md) (stage 2.0) |
