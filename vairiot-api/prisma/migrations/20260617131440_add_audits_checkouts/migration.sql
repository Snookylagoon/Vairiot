-- CreateTable
CREATE TABLE "audit_campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_scan_events" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tagValue" TEXT NOT NULL,
    "assetId" TEXT,
    "scannedBy" TEXT NOT NULL,
    "deviceId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'found',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "custodianId" TEXT NOT NULL,
    "checkedOutBy" TEXT NOT NULL,
    "checkedInBy" TEXT,
    "expectedReturn" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_campaigns_tenantId_status_idx" ON "audit_campaigns"("tenantId", "status");

-- CreateIndex
CREATE INDEX "audit_scan_events_campaignId_idx" ON "audit_scan_events"("campaignId");

-- CreateIndex
CREATE INDEX "audit_scan_events_tenantId_tagValue_idx" ON "audit_scan_events"("tenantId", "tagValue");

-- CreateIndex
CREATE INDEX "checkouts_tenantId_assetId_idx" ON "checkouts"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "checkouts_tenantId_custodianId_idx" ON "checkouts"("tenantId", "custodianId");

-- CreateIndex
CREATE INDEX "checkouts_tenantId_checkedInAt_idx" ON "checkouts"("tenantId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "audit_campaigns" ADD CONSTRAINT "audit_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_scan_events" ADD CONSTRAINT "audit_scan_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
