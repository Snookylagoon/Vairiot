-- Scan positions and position events (Phase 1 W2, stage 1.5).

-- One trigger function for any table with latitude, longitude and geom.
CREATE OR REPLACE FUNCTION sync_geom_from_lat_lon() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."geom" := NULL;
  ELSE
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Where the device was when it scanned the tag (not where the asset is).
ALTER TABLE "audit_scan_events"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geoAccuracyMeters" DOUBLE PRECISION,
  ADD COLUMN "geoSource" TEXT,
  ADD COLUMN "geom" geography(Point, 4326);

ALTER TABLE "audit_scan_events" ADD CONSTRAINT "audit_scan_events_geo_pair_check"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "audit_scan_events" ADD CONSTRAINT "audit_scan_events_geo_range_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "audit_scan_events" ADD CONSTRAINT "audit_scan_events_geo_accuracy_check"
  CHECK ("geoAccuracyMeters" IS NULL OR "geoAccuracyMeters" >= 0);

CREATE TRIGGER "audit_scan_events_sync_geom"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "audit_scan_events"
  FOR EACH ROW EXECUTE FUNCTION sync_geom_from_lat_lon();

CREATE INDEX "audit_scan_events_geom_idx" ON "audit_scan_events" USING GIST ("geom");

-- The register's position at snapshot time, for blind-audit comparison.
ALTER TABLE "audit_snapshot_assets"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geoAccuracyMeters" DOUBLE PRECISION;

-- Ledger events for an asset's position (asset_events is append-only).
ALTER TYPE "AssetEventType" ADD VALUE IF NOT EXISTS 'POSITION_CAPTURED';
ALTER TYPE "AssetEventType" ADD VALUE IF NOT EXISTS 'POSITION_CORRECTED';
