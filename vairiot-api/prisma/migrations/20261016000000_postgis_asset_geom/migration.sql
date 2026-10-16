-- PostGIS foundation (Phase 1 W1, stage 1.4, decision D11).
--
-- Needs a PostGIS-enabled server image (postgis/postgis:16-3.5-alpine). On
-- the old postgres:16-alpine image CREATE EXTENSION fails, the migration step
-- of deploy.sh stops, and the running version keeps serving.
CREATE EXTENSION IF NOT EXISTS postgis;

-- latitude / longitude stay the source of truth: every client and the API
-- already write them. geom is derived, so no write path changes.
ALTER TABLE "assets" ADD COLUMN "geom" geography(Point, 4326);

CREATE OR REPLACE FUNCTION assets_sync_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."geom" := NULL;
  ELSE
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assets_sync_geom"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "assets"
  FOR EACH ROW EXECUTE FUNCTION assets_sync_geom();

-- Back-fill assets placed before this migration.
UPDATE "assets"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

CREATE INDEX "assets_geom_idx" ON "assets" USING GIST ("geom");
