# GIS Data Model

| Item        | Detail                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Purpose     | The GIS database structure of Vairiot Asset Intelligence: TOR Deliverable D4                             |
| Revision    | 0.1 (16 October 2026), at the close of Phase 1 (version 2.6.0)                                            |
| Built in    | Stages 1.1–1.12 (positions, PostGIS, scan positions, scan photos, map); see the [stage log](stage-log.md) |
| Module flag | `gis` per tenant (D7). Off: every GIS route answers 404, positions sent by clients are ignored            |
| See also    | [Data model](02-data-model-and-module-registry.md) · [Phase 1 plan](03-phase-1-plan.md) §2               |

## 1. Principles

- **One coordinate system in the database: WGS 84 (EPSG:4326).** Every position is stored as latitude and longitude in decimal degrees, as the devices' GNSS receivers report them.
- **Plain columns are the source of truth.** `latitude` and `longitude` are `DOUBLE PRECISION` columns that the apps, the API and older clients read and write. The PostGIS `geom` column is derived from them by a database trigger and is never written by the application (§3).
- **Every position has its quality and origin.** Accuracy in metres, the source (manual, device, import) and the capture time travel with each position.
- **Positions belong to a tenant.** Every spatial table carries `tenantId`. Row-level security on `assets`, `audit_events` and `photos` (stage 1.19, D5) keeps one tenant's positions out of another's queries, even a raw spatial query.
- **The history is kept.** A captured or corrected asset position is written to the asset's event ledger (§5).

## 2. Spatial tables and columns

### 2.1 `assets`: the register position

| Column              | Type                       | Rule                                                                                   |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `latitude`          | `DOUBLE PRECISION` null    | −90..90; set together with `longitude` or not at all (`assets_geo_pair_check`)         |
| `longitude`         | `DOUBLE PRECISION` null    | −180..180 (`assets_geo_range_check`)                                                   |
| `geoAccuracyMeters` | `DOUBLE PRECISION` null    | ≥ 0 (`assets_geo_accuracy_check`); horizontal accuracy reported by the device          |
| `geoSource`         | `TEXT` null                | `manual` (form or map), `device` (captured by the app), `import` (register import)      |
| `geoCapturedAt`     | `TIMESTAMP(3)` null        | When the position was taken; defaults to the time of the write                         |
| `geom`              | `geography(Point,4326)` null | Derived by trigger `assets_sync_geom`; GIST index `assets_geom_idx`                  |

Sending only one coordinate is refused (400). Sending both as empty clears the position and its metadata. Re-sending the position an asset already has changes nothing, so a form that round-trips every field does not restamp it.

### 2.2 `audit_scan_events`: where each tag was counted

| Column              | Type                         | Rule                                                                   |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `latitude`, `longitude` | `DOUBLE PRECISION` null  | Same pair and range checks as assets                                   |
| `geoAccuracyMeters` | `DOUBLE PRECISION` null      | ≥ 0, rounded to 0.1 m                                                  |
| `geoSource`         | `TEXT` null                  | `device`                                                               |
| `geom`              | `geography(Point,4326)` null | Trigger `audit_scan_events_sync_geom`; GIST index `audit_scan_events_geom_idx` |

Both apps refresh a fix every 20 seconds while an audit is open and attach it to a scan only if it is under 60 seconds old. A position the server cannot use is dropped and the scan accepted: a scan is never refused for its position. With `gis` off, positions are ignored.

### 2.3 `audit_snapshot_assets`: the register position at campaign start

`latitude`, `longitude`, `geoAccuracyMeters` copied from the asset when the campaign's snapshot is taken, so a campaign's map shows where each asset was expected even if the register moves it later.

### 2.4 `photos`: where and when a photo was taken

| Column                  | Type                    | Rule                                                                                       |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `latitude`, `longitude` | `DOUBLE PRECISION` null | Pair and range checks. From the value sent, else the photo's EXIF GPS, else the scan's fix  |
| `geoAccuracyMeters`     | `DOUBLE PRECISION` null | As sent                                                                                    |
| `capturedAt`            | `TIMESTAMP(3)` null     | From the value sent, else EXIF, else the scan time                                         |
| `scanEventId`           | `TEXT` null             | The scan the photo belongs to; a photo belongs to an asset, a scan or both                 |
| `campaignId`            | `TEXT` null             | The campaign, for the gallery                                                              |
| `photoType`             | `TEXT`                  | `inventory`, `condition`, `label`, `general`                                               |

Photos have no `geom`: they are shown against their scan or asset, not queried by area. The stored original keeps its metadata as evidence; every copy that leaves the API is stripped of EXIF, GPS included (D13, KFR-043).

### 2.5 `tenants.mapSettings`: the base map

`JSONB`, default `{}`. Holds `tileUrl` (https, with `{z}`, `{x}`, `{y}`), `attribution` (plain text), `centreLatitude`, `centreLongitude` and `zoom` (1–19). Missing or invalid values fall back to OpenStreetMap centred on the world; the TUDA seed centres on Tbilisi. A tenant can point `tileUrl` at its own tile server.

## 3. Derived geometry

```sql
CREATE FUNCTION sync_geom_from_lat_lon() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."geom" := NULL;
  ELSE
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

The trigger fires `BEFORE INSERT OR UPDATE OF latitude, longitude`, so `geom` can never disagree with the columns. `geography` measures in metres on the ellipsoid, which suits distances and areas in Georgia without a projected system. Prisma declares `geom` as `Unsupported("geography(Point,4326)")`; the API reads it only through raw SQL in the geo services.

## 4. Coordinate reference systems

| Case                       | Handling                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Devices, web form, map     | WGS 84 decimal degrees, stored as given                                                                                       |
| GeoJSON out                | RFC 7946: WGS 84, coordinates in `[longitude, latitude]` order                                                                |
| Georgian national grid     | Not yet. Import with transformation from the national grid comes with the GIS exchange in S5; until then registers must supply WGS 84 |
| Columns planned for import | `altitudeM`, `gisFeatureId`, `gisLayer`, `sourceCrs` (Phase 1 plan §2.2) are not yet built: they arrive with the GIS exchange    |

## 5. Events

Position changes on an asset are appended to its event ledger (`asset_events`, the `AssetEventType` enum):

| Event                | When                                                                    | Payload                         |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `POSITION_CAPTURED`  | An asset without a position gets one                                    | Position, accuracy, source      |
| `POSITION_CORRECTED` | A positioned asset moves by more than 1 m (smaller moves are GPS noise) | New and `previous` position     |

Scan positions are not ledger events: the scan itself is the record.

## 6. Endpoints

All behind `requireFeature('gis')`: 404 when the tenant has GIS off.

| Endpoint                                            | Permission                     | Returns                                                                                                                              |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/assets/geo?bbox=minLon,minLat,maxLon,maxLat&limit=` | `asset:read`      | GeoJSON `FeatureCollection` of assets in the box (`ST_Intersects`), with `truncated`. `limit` 1–5000, default 1000. A bad box is 400 |
| `GET /api/v1/assets/map?search=&categoryId=&siteId=&status=&condition=` | `asset:read` | Positions for the all-assets map, with `total`, `unplaced` and `truncated`; same filters as the asset list                           |
| `GET /api/v1/audits/:id/map`                        | `audit:read` or `audit:write`  | The campaign layer: expected assets coloured by count state, surplus tags at their scan position, counts per state                  |
| `GET /api/v1/audits/:id/scans/geo`                  | `audit:read` or `audit:write`  | GeoJSON of the campaign's positioned scans (result hidden for blind audits)                                                          |
| `GET /api/v1/gis/map-settings`                      | any signed-in user             | The tenant's base map                                                                                                                |
| `PUT /api/v1/gis/map-settings`                      | `company:manage`               | Saves the base map; audited                                                                                                          |

Positions are written through the existing asset, scan and photo endpoints, not GIS-only ones. The OpenAPI document (`/api/openapi.json`, browsable at `/api/docs`) describes each one.

### 6.1 Example

```http
GET /api/v1/assets/geo?bbox=44.7,41.6,44.9,41.8&limit=2
```

```json
{
  "type": "FeatureCollection",
  "truncated": true,
  "features": [
    {
      "type": "Feature",
      "id": "cm…",
      "geometry": { "type": "Point", "coordinates": [44.7983, 41.6995] },
      "properties": {
        "assetNumber": "TUDA-000123", "name": "Road sign", "status": "active", "condition": "good",
        "siteId": "cm…", "geoAccuracyMeters": 4, "geoSource": "device"
      }
    }
  ]
}
```

## 7. Database setup

- PostGIS 3.5 on Postgres 16 in every environment (`postgis/postgis:16-3.5-alpine`, D11; `imresamu/postgis:16-3.5-alpine` on ARM machines through `POSTGIS_IMAGE`).
- Migrations, in order: `20261012000000_asset_gis_position`, `20261016000000_postgis_asset_geom` (creates the extension), `20261016010000_scan_positions`, `20261016020000_scan_photos`, `20261016030000_tenant_map_settings`.
- Backups (`infra/backup.sh`) dump the extension with the data; a dump restores only into a PostGIS server, which `infra/restore-test.sh` uses.

## 8. Not yet built

| Item                                   | Planned                                    |
| -------------------------------------- | ------------------------------------------ |
| Zone polygons (`Location.boundary`)    | S3, with zone drawing                       |
| GeoJSON and Shapefile import and export | S5 GIS exchange, with national-grid transformation |
| Altitude, feature id, layer, source CRS | With the GIS exchange                      |
| Burned-in photo stamp (`photoStamp`)    | Deferred: the stamp data is stored and shown in the gallery |
