-- Sprint 10: allow photos to be attached to a maintenance event
ALTER TABLE "photos" ADD COLUMN "maintenanceEventId" TEXT;

ALTER TABLE "photos"
  ADD CONSTRAINT "photos_maintenanceEventId_fkey"
  FOREIGN KEY ("maintenanceEventId") REFERENCES "maintenance_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "photos_tenantId_maintenanceEventId_idx"
  ON "photos"("tenantId", "maintenanceEventId");
