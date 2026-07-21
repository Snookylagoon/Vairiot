-- Offline-sync integrity: client idempotency keys + device capture timestamps.

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "clientRequestId" TEXT;

-- AlterTable
ALTER TABLE "audit_scan_events" ADD COLUMN "capturedAt" TIMESTAMP(3);
ALTER TABLE "audit_scan_events" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_clientRequestId_key" ON "assets"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_scan_events_clientRequestId_key" ON "audit_scan_events"("clientRequestId");
