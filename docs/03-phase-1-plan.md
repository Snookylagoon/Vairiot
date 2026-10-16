# Phase 1 — GIS, Condition and Photos (Plan)

| Item                     | Detail                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                    | 1 (Sprint S1, decision D1)                                                                                                              |
| Status                   | In progress — stages 1.1–1.3 (positions, GPS capture, map) were built before the standard; stage 1.0 hands over; W1 starts at stage 1.4 |
| Revision                 | 0.1 (16 October 2026)                                                                                                                   |
| Builds on                | Phase 0, accepted 16 October 2026; version 2.0.1                                                                                        |
| Modules                  | `gis` — positions, scan positions, map, zones (S3); `photoStamp` (new flag, S1.3); condition scale is core                              |
| Prompts                  | [S1 sprint file](sprints/S1-gis-condition-photos.md) S1.1–S1.6 — the detailed steps for each workstream                                 |
| Exit gate (test plan §8) | [Test plan §8.2](testing/test-plan.md): S1.1–S1.5 gates plus the S1 toggle gate, run on the Docker stack behind nginx                   |

## 1. Workstreams

| #   | Workstream                         | Packages                                | Content                                                                                                                                                                                          | Status      |
| --- | ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| W0  | Hand-over                          | docs                                    | Stage 1.0: Phase 0 acceptance recorded, sprint files amended (G22, G25), this plan                                                                                                               | Built       |
| W1  | PostGIS foundation (S1.1 rest)     | infra, api, CI                          | PostGIS image everywhere (D11); `postgis` extension; `Asset.geom geography(Point,4326)` kept in step by a trigger, GIST index; `GET /assets/geo?bbox=` GeoJSON behind `gis`; OpenAPI; tests      | Built — stage 1.4 |
| W2  | Scan positions (S1.1 step 3, S1.2) | api, shared, android, ios               | Position fields on `AuditScanEvent` and `AuditSnapshotAsset`; `POSITION_CAPTURED` / `POSITION_CORRECTED` events; background fix per audit scan on both apps; `GET /audits/:id/scans/geo`         | Planned     |
| W3  | Photo bound to scan (S1.3)         | api, worker, android, ios, web          | `Photo.scanEventId`, campaign, position, `photoType`; EXIF read then stripped (KFR-043 already strips on download); server thumbnails; scan photo capture on both apps; `PhotoRule`; web gallery | Planned     |
| W4  | Map extensions (S1.4 rest)         | web, api                                | Campaign layer coloured by reconciliation state; "Set position" by dragging; per-tenant base map settings; Playwright smoke                                                                      | Planned     |
| W5  | Condition scale (S1.5)             | api, shared, web, android, ios, reports | `ConditionScale` with default 1–5 seed; `conditionGrade` with backfill; `CONDITION_ASSESSED` events; admin page; mobile selector; report grouping                                                | Planned     |
| W6  | Security (adoption W4, first part) | api, infra                              | Row-level security on `Asset`, `AuditEvent`, `Photo` (D5, G23); mandatory two-factor for Administrator and platform-admin with grace (D6); G27 Semgrep triage; non-root images (G16)             | Planned     |
| W7  | Phase close (S1.6)                 | all                                     | Exit gate on the Docker stack; `docs/04-phase-1-record.md`; `docs/GIS-DATA-MODEL.md`; Word report; owner acceptance; `phase-1-accepted`                                                          | Planned     |

Each workstream lands as one or more stages (1.4, 1.5, …), each merged on a green pipeline with a version bump: `feat` stages bump the minor version (2.1.0 for W1), fixes the patch.

## 2. Design

### 2.1 PostGIS (W1)

- **Image:** `postgis/postgis:16-3.5-alpine` in every Compose file, the CI service and the test stack (D11). The Alpine variant keeps the musl C library the current `postgres:16-alpine` uses, so the production data directory and its text-collation indexes stay valid; a Debian-based image would change the collation library and needs a reindex.
- **Columns:** the existing `latitude` and `longitude` `Float` columns stay the source of truth (the apps and the API already use them). `geom geography(Point,4326)` is derived from them by a trigger, so no write path changes and old clients keep working. GIST index on `geom`.
- **Prisma:** `geom` is `Unsupported("geography(Point,4326)")?` in the schema, written only by the trigger and read only through raw SQL in the geo service.
- **Endpoint:** `GET /api/v1/assets/geo?bbox=minLon,minLat,maxLon,maxLat&limit=` returns a GeoJSON `FeatureCollection` of the tenant's assets in the box (`ST_Intersects`), behind `requireFeature('gis')`. Bounding box validated: four numbers, longitude −180..180, latitude −90..90, min < max; `limit` 1–5000, default 1000.
- **Production change:** switching the image is a deploy step with a backup and restore test before it (DEPLOY.md gains the procedure); the migration that creates the extension fails safely on a server still on the old image, so `deploy.sh` stops before anything restarts.

### 2.2 Later workstreams

Designs for W2–W6 follow the S1 sprint prompts, with these changes agreed so far:

| Area           | Sprint file                                                         | Change                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position model | New `Decimal` columns `latitude`, `gpsAccuracyM`, `positionSource`… | Keep the `Float` columns already built (`latitude`, `longitude`, `geoAccuracyMeters`, `geoSource`, `geoCapturedAt`); add only what is missing (`altitudeM`, `gisFeatureId`, `gisLayer`, `sourceCrs`) |
| Map library    | MapLibre GL JS                                                      | Leaflet, already used by the asset map (D12)                                                                                                                                                         |
| Map route      | `/map`                                                              | Extend the existing `/assets/map`                                                                                                                                                                    |
| EXIF           | Strip on upload                                                     | Downloads are already stripped (KFR-043); add strip on upload so stored originals are clean                                                                                                          |

## 3. Exit-gate tests

| Test                             | Pass condition                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `assets/asset-geo-bbox.test.ts`  | Migration applies to a fresh database; the box returns only in-box assets of the caller's tenant; 404 with `gis` off; bad boxes 400 |
| Mobile scan-position tests       | Fake location provider: a scan queued offline replays with its position                                                             |
| `photos/scan-photos.test.ts`     | A scan photo is listed against its scan with time and position; the stored original has no EXIF GPS                                 |
| Playwright map smoke             | `/assets/map` loads seeded TUDA assets as clustered markers                                                                         |
| `assets/condition-scale.test.ts` | Backfill maps the old strings to grades; grade 2 without a photo is flagged                                                         |
| S1 toggle matrix                 | With `gis` off every S1 GIS route answers 404; on again, data unchanged                                                             |
| Tenancy (W6)                     | With RLS on, a query without the tenant setting returns no `Asset`, `AuditEvent` or `Photo` rows                                    |

## 4. Decisions

| #   | Decision                                                 | Recommendation                                                               | Status       |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| D11 | Database image for production, staging, dev, test and CI | `postgis/postgis:16-3.5-alpine` (same Postgres major and C library as today) | **Proposed** |
| D12 | Web map library                                          | Leaflet (in use since stage 1.3); a Leaflet drawing plugin for S3 zones      | **Proposed** |

## 5. Out of scope for Phase 1

- Georgian national grid import and CRS transformation — stored as `sourceCrs` only; transformation with the GIS exchange in S5.
- Zone polygons on `Location.boundary` — column added in W2 if cheap, editing in S3.
- Module registry and admin toggle screen (adoption W5) — Phase 2, alongside the `ipsas` module.
- Prettier across the codebase (G28) — at a quiet point with no open branches.
