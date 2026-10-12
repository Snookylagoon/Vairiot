-- GIS position for assets (WGS 84 decimal degrees), alongside the existing
-- descriptive site / location.
-- AlterTable
ALTER TABLE "assets" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "geoAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "geoSource" TEXT,
ADD COLUMN "geoCapturedAt" TIMESTAMP(3);

-- Coordinates are a pair, in range. Prisma doesn't model CHECK constraints,
-- so these live only here; the API validates the same rules first.
ALTER TABLE "assets" ADD CONSTRAINT "assets_geo_pair_check"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "assets" ADD CONSTRAINT "assets_geo_range_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "assets" ADD CONSTRAINT "assets_geo_accuracy_check"
  CHECK ("geoAccuracyMeters" IS NULL OR "geoAccuracyMeters" >= 0);
