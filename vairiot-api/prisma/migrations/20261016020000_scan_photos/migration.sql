-- Photos bound to audit scans (Phase 1 W3, stage 1.7).

-- A scan of an unknown tag has no asset, so a scan photo may have none.
ALTER TABLE "photos" ALTER COLUMN "assetId" DROP NOT NULL;

ALTER TABLE "photos"
  ADD COLUMN "scanEventId" TEXT,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geoAccuracyMeters" DOUBLE PRECISION,
  ADD COLUMN "capturedAt" TIMESTAMP(3),
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "photoType" TEXT NOT NULL DEFAULT 'general';

ALTER TABLE "photos" ADD CONSTRAINT "photos_photo_type_check"
  CHECK ("photoType" IN ('inventory', 'condition', 'label', 'general'));
ALTER TABLE "photos" ADD CONSTRAINT "photos_geo_pair_check"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "photos" ADD CONSTRAINT "photos_geo_range_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
-- Every photo belongs to something: an asset, a maintenance event or a scan.
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_check"
  CHECK ("assetId" IS NOT NULL OR "scanEventId" IS NOT NULL);

ALTER TABLE "photos" ADD CONSTRAINT "photos_scanEventId_fkey"
  FOREIGN KEY ("scanEventId") REFERENCES "audit_scan_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photos" ADD CONSTRAINT "photos_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "photos_tenantId_campaignId_idx" ON "photos"("tenantId", "campaignId");
CREATE INDEX "photos_scanEventId_idx" ON "photos"("scanEventId");
