# Sprint 1 — GIS, condition and photos (weeks 3–6)

**Goal:** every asset and every scan can carry a location, a photo and a graded condition; the web console can show them on a map. Feeds TOR Deliverables D3 and D4.

**Fit-gap items:** 11 (GPS/GIS), 12 (map, part), 13 (photos), 14 (condition).

**Branch:** `feature/s1-gis-capture`

---

## Prompt S1.1 — PostGIS and the location data model

```
Add PostGIS and location fields to the Vairiot data model.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api/prisma/schema.prisma (45 models; Asset at line ~267, AuditScanEvent ~447, Site ~227, Location ~247)
- Database: PostgreSQL via Prisma 5; docker images must change to postgis/postgis:16-3.4 in infra/docker-compose*.yml
- Coordinate system: WGS 84 (SRID 4326) for storage; TUDA may use a Georgian national grid — store the source CRS when imported
- Every table carries tenantId

Steps:
1. Enable the postgis extension in a Prisma migration (`CREATE EXTENSION IF NOT EXISTS postgis;`) and switch the Postgres image in every compose file.
2. Add to Asset: latitude Decimal(9,6)?, longitude Decimal(9,6)?, altitudeM Decimal(7,2)?, gpsAccuracyM Decimal(6,2)?, positionSource String? (gps, manual, gis_import, geocoded), positionCapturedAt DateTime?, gisFeatureId String?, gisLayer String?, sourceCrs String? (default "EPSG:4326"). Add a generated geography column `geom geography(Point,4326)` via raw SQL in the migration, kept in step by a trigger from latitude/longitude, with a GIST index.
3. Add the same latitude, longitude, gpsAccuracyM and positionSource to AuditScanEvent and AuditSnapshotAsset (snapshot = position at snapshot time).
4. Add to Location: boundary geography(Polygon,4326)? via raw SQL, with a GIST index, for inventory zones (used in S3).
5. Add AssetEventType values POSITION_CAPTURED and POSITION_CORRECTED in vairiot-shared and the schema enum.
6. Extend vairiot-shared Zod schemas for asset create/update and scan create with the optional position fields, validating latitude −90..90, longitude −180..180, accuracy ≥ 0.
7. Update asset.service.ts and audit.service.ts to accept, store and return the fields, to write POSITION_CAPTURED events on first capture, and POSITION_CORRECTED when a position changes by more than 1 metre.
8. Add `GET /api/v1/assets/geo?bbox=minLon,minLat,maxLon,maxLat&limit=` returning GeoJSON FeatureCollection of assets in the box (tenant-scoped, ST_Intersects on geom), and `GET /api/v1/audits/:id/scans/geo` for scan events. Document both in OpenAPI.
9. Add Jest tests: migration applies, bbox query returns only in-box tenant assets, events are written.

Output:
- Prisma migration(s), schema, shared schemas, services, routes, tests, compose changes
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `npm run db:migrate --workspace=vairiot-api` succeeds on a fresh database; `npm test --workspace=vairiot-api` passes; `curl /api/v1/assets/geo?bbox=44.7,41.6,44.9,41.8` returns GeoJSON.

---

## Prompt S1.2 — Mobile GPS capture (Android then iOS)

```
Capture GPS position on the mobile apps whenever an asset is created, edited or scanned in an audit.

Context:
- Android path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-mobile/app/src/main (AssetEditScreen.kt, AssetEditViewModel.kt, AssetScanScreen.kt, AuditRunViewModel.kt, QueuedAsset.kt, QueuedScan.kt, ApiModels.kt)
- iOS path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-ios/VairiotMobile (Screens/Assets, Screens/Audits, Models/Asset.swift, Models/Audit.swift)
- Devices: Meferi ME61/65/74 (Android 13) and iPhone; both have GNSS; accuracy on streets is typically 5–15 m
- Offline queue rules from S0: position must be stored in the queued row and replayed

Steps (Android first, then mirror on iOS):
1. Add a LocationService (FusedLocationProviderClient on Android, CLLocationManager on iOS) with a single `currentFix()` call that returns latitude, longitude, altitude, accuracy and timestamp, waiting up to 8 seconds for accuracy ≤ 15 m, otherwise returning the best fix with its accuracy.
2. Request location permission on first use with a plain-language explanation; handle denial by allowing manual entry.
3. On asset create and edit: capture a fix automatically when the screen opens; show a small "Position: 41.7151, 44.8271 ±8 m" line with a Refresh button and a Manual button (enter coordinates or pick on a map in S1.4).
4. On audit scan: capture a fix per scan event in the background without blocking the scan loop; attach it to the queued scan.
5. Add the position fields to the API models, queued entities (with Room / SwiftData migrations) and the sync workers.
6. Show accuracy with a colour cue: green ≤ 10 m, amber ≤ 25 m, red above; a red fix prompts "Move to open sky and refresh" but still saves.
7. Add unit tests with a fake location provider.
8. Record anything learnt about Meferi GNSS behaviour in docs/known-fix-registry.md.

Output:
- Location services, screen changes, model and queue changes, migrations, tests on both platforms
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** creating an asset outdoors on a Meferi device stores a position with accuracy; scanning in an audit writes positions to AuditScanEvent after sync.

---

## Prompt S1.3 — Photo bound to the scan, with GPS and time stamp

```
Bind photographic evidence to each inventory scan and stamp it with position and time.

Context:
- API: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api (Photo model has assetId and maintenanceEventId; photos stream through the API into MinIO; thumbnails are made client-side; no EXIF handling)
- Mobile: AssetPhotosSection.kt, AssetPhotosViewModel.kt, ImageCompressor.kt (Android); Screens/Photos (iOS); QueuedPhoto from S0
- Policy: at least one photo per street asset at inventory; a condition of 2 or below (S1.5) needs a photo

Steps:
1. Add to Photo: scanEventId String? (FK to AuditScanEvent), campaignId String?, latitude, longitude, gpsAccuracyM, capturedAt DateTime?, deviceId String?, photoType String (inventory, condition, label, general). Migration plus indexes on (tenantId, campaignId) and (scanEventId).
2. In photo.service.ts: on upload, read EXIF with a library (exifr or sharp metadata), take capturedAt and GPS from EXIF when present, prefer the client-sent values when both exist, then strip EXIF from the stored original and generate a 320 px thumbnail server-side with sharp. Reject files over 10 MB and types other than JPEG/PNG/HEIC (convert HEIC to JPEG).
3. Add `POST /api/v1/audits/:id/scans/:scanId/photos` and `GET /api/v1/audits/:id/photos?locationId=` and extend the OpenAPI spec.
4. Add an optional burned-in stamp (asset number, date-time, lat/long, accuracy) rendered by sharp onto a copy stored as `storageKey-stamped`, controlled by tenant feature flag photoStamp.
5. Mobile: in AuditRunScreen / AuditRunView add a camera button on the current scan that captures, compresses to ≤ 1.5 MB, writes to QueuedPhoto with the scan's clientRequestId and the fix from S1.2, and drains through PhotoSyncWorker. The worker must wait until the scan itself has synced (it needs the scan ID) and must resolve the scan by clientRequestId.
6. Add a tenant rule table PhotoRule (categoryId?, minPhotosAtInventory Int, requirePhotoBelowCondition Int?) with an admin page under vairiot-web/src/pages/admin and enforcement at zone submission (warning list, not a hard block, in this sprint).
7. Web: show scan photos on AuditRunPage and AuditReconciliationPage with a lightbox and the stamp data.
8. Jest tests for EXIF handling, stripping and rules; mobile unit tests for the queue ordering.

Output:
- Migration, services, routes, worker changes, mobile capture, web gallery, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** a photo taken during an audit appears against that scan in the web console with time and position; the stored file has no EXIF GPS data.

---

## Prompt S1.4 — Map view in the web console

```
Add an interactive map of assets and inventory progress to vairiot-web.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-web/src (React 18, Vite, Tailwind, React Query hooks in src/hooks, pages in src/pages)
- Data: GET /api/v1/assets/geo and /api/v1/audits/:id/scans/geo from S1.1
- Map library: MapLibre GL JS with OpenStreetMap raster tiles by default; tile URL and attribution configurable per tenant (TUDA may supply its own base map) via tenant settings
- Design system: Montserrat headings, IBM Plex Mono for codes, brand gradient #FF0DCC → #A05B97 → #615AA0, charcoal #2B3132

Steps:
1. Add src/pages/map/MapPage.tsx at route /map with: a MapLibre map centred on the tenant's default (Tbilisi 41.7151, 44.8271, zoom 12 for TUDA); clustering above 500 points; filters for category, site, status, condition, "no position", "accuracy > 25 m"; a side panel listing assets in view; click a marker to open an asset summary with a link to AssetDetailPage.
2. Add a Campaign layer: when a campaign is selected, colour markers by reconciliation state (verified, misplaced, missing, surplus, condition variance, not yet scanned) and show zone progress.
3. Add a "Set position" mode on AssetDetailPage and EditAssetPage: drag a marker or click the map to set latitude/longitude, with positionSource = manual and a reason note; this writes POSITION_CORRECTED.
4. Add a mini-map (static, non-interactive) to AssetDetailPage showing the asset's position and accuracy circle.
5. Add a tenant settings section for base map URL, attribution, default centre and zoom (admin page).
6. Add Vitest tests for the filter logic and a Playwright smoke test that loads /map and sees markers from seeded data.
7. Add the route to the navigation with a map icon and the feature flag gis.

Output:
- MapPage, components, hooks, settings page, tests, navigation
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `/map` shows seeded TUDA assets as clustered markers; selecting a campaign recolours markers; dragging a marker updates the asset and writes an event.

---

## Prompt S1.5 — Condition assessment scale

```
Replace the free-text asset condition with a configurable graded scale with criteria per asset class.

Context:
- Current: Asset.condition String default "good"; vairiot-shared/src/constants/asset.constants.ts AssetCondition (excellent, good, fair, poor …); reconciliation uses condition_variance; reports: vairiot-reports/app/reports/assets/asset_condition.py
- TOR D3 requires physical condition assessment criteria; IPSAS 21/26 impairment indicators come from condition (S2)

Steps:
1. Add ConditionScale (tenantId, categoryId?, grade Int 1–5, label, criteria text, colour, impairmentIndicator Boolean, photoRequired Boolean) with a migration and a default seed: 5 Excellent, 4 Good, 3 Fair, 2 Poor, 1 Unserviceable; grades 1–2 impairmentIndicator = true and photoRequired = true.
2. Add Asset.conditionGrade Int? and AuditScanEvent.conditionGrade Int?, keep the string fields for backward compatibility, and backfill conditionGrade from the existing strings in the migration (excellent→5, good→4, fair→3, poor→2, unserviceable→1).
3. Write CONDITION_ASSESSED events with before/after grade; add a condition history list on AssetDetailPage.
4. Admin page under vairiot-web/src/pages/admin/ConditionScalePage.tsx to edit labels and criteria per category (category-specific rows override tenant defaults).
5. Mobile: replace the condition dropdown with a 1–5 selector that shows the criteria text for the asset's category; enforce the photoRequired rule from S1.3 with a prompt.
6. Reports: update asset_condition.py and reconciliation_detail.py to group by grade and label; add a per-category condition distribution.
7. Update Zod schemas, OpenAPI, Jest and mobile tests.

Output:
- Migration with backfill, admin page, mobile selectors, report updates, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** existing assets show a grade after migration; selecting grade 2 on mobile prompts for a photo; the condition report groups by grade.

---

## Prompt S1.6 — Sprint close

```
Close sprint S1 on branch feature/s1-gis-capture.

Steps:
1. Run `npm run lint`, `npm test`, `./gradlew testDebugUnitTest` in vairiot-mobile, and the Playwright smoke test; fix failures.
2. Run the register profiler from S0.6 against the seeded TUDA data to confirm new columns appear in exports.
3. Update docs/known-fix-registry.md and write docs/sprints/S1-summary.md (what changed, how to verify, open items, full file list).
4. Add docs/GIS-DATA-MODEL.md describing the position fields, CRS handling, events and the geo endpoints, for the consultant's Deliverable D4 (GIS database structure).
5. Open a pull request from feature/s1-gis-capture to develop.

Output:
- docs/sprints/S1-summary.md, docs/GIS-DATA-MODEL.md, pull request URL

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S1.1 PostGIS and location model
- [ ] S1.2 Mobile GPS capture (Android and iOS)
- [ ] S1.3 Photo bound to scan
- [ ] S1.4 Map view
- [ ] S1.5 Condition scale
- [ ] S1.6 Sprint close and PR merged
