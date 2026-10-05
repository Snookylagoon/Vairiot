-- S0.4: delta sync for mobile asset caches (GET /assets?changedSince=)
-- CreateIndex
CREATE INDEX "assets_tenantId_updatedAt_idx" ON "assets"("tenantId", "updatedAt");

-- S0.4: iOS UDID enrolment — record whether the payload signature verified
-- AlterTable
ALTER TABLE "ios_devices" ADD COLUMN "signatureVerified" BOOLEAN NOT NULL DEFAULT false;
