-- Blind Audit mode: schema additions
-- Adds campaign mode, register snapshot, zone submissions, reconciliation,
-- adjustments, and tenant feature flags.

-- ── Tenant feature flags ─────────────────────────────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN "featureFlags" JSONB NOT NULL DEFAULT '{}';

-- ── Campaign: mode + double-blind link ───────────────────────────────────────
ALTER TABLE "audit_campaigns"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'sighted',
  ADD COLUMN "linkedCampaignId" TEXT;

ALTER TABLE "audit_campaigns"
  ADD CONSTRAINT "audit_campaigns_linkedCampaignId_fkey"
  FOREIGN KEY ("linkedCampaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Scan events: location + condition capture ────────────────────────────────
ALTER TABLE "audit_scan_events"
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "condition"  TEXT;

-- ── Register snapshot ────────────────────────────────────────────────────────
CREATE TABLE "audit_snapshot_assets" (
  "id"            TEXT         NOT NULL,
  "campaignId"    TEXT         NOT NULL,
  "assetId"       TEXT         NOT NULL,
  "assetNumber"   TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "rfidTag"       TEXT,
  "barcode"       TEXT,
  "siteId"        TEXT,
  "locationId"    TEXT,
  "categoryId"    TEXT,
  "condition"     TEXT,
  "purchaseCost"  DECIMAL(12,2),
  "residualValue" DECIMAL(12,2),
  "snapshotAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_snapshot_assets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_snapshot_assets"
  ADD CONSTRAINT "audit_snapshot_assets_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "audit_snapshot_assets_campaignId_assetId_key"
  ON "audit_snapshot_assets"("campaignId", "assetId");

CREATE INDEX "audit_snapshot_assets_campaignId_idx"
  ON "audit_snapshot_assets"("campaignId");

-- ── Zone submissions ─────────────────────────────────────────────────────────
CREATE TABLE "audit_zone_submissions" (
  "id"          TEXT         NOT NULL,
  "campaignId"  TEXT         NOT NULL,
  "locationId"  TEXT         NOT NULL,
  "submittedBy" TEXT         NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_zone_submissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_zone_submissions"
  ADD CONSTRAINT "audit_zone_submissions_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "audit_zone_submissions_campaignId_locationId_key"
  ON "audit_zone_submissions"("campaignId", "locationId");

CREATE INDEX "audit_zone_submissions_campaignId_idx"
  ON "audit_zone_submissions"("campaignId");

-- ── Reconciliation items ─────────────────────────────────────────────────────
CREATE TABLE "audit_reconciliation_items" (
  "id"                 TEXT         NOT NULL,
  "campaignId"         TEXT         NOT NULL,
  "snapshotAssetId"    TEXT,
  "scanEventId"        TEXT,
  "classification"     TEXT         NOT NULL,
  "snapshotLocationId" TEXT,
  "foundLocationId"    TEXT,
  "snapshotCondition"  TEXT,
  "foundCondition"     TEXT,
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_reconciliation_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_reconciliation_items"
  ADD CONSTRAINT "audit_reconciliation_items_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_reconciliation_items"
  ADD CONSTRAINT "audit_reconciliation_items_snapshotAssetId_fkey"
  FOREIGN KEY ("snapshotAssetId") REFERENCES "audit_snapshot_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_reconciliation_items"
  ADD CONSTRAINT "audit_reconciliation_items_scanEventId_fkey"
  FOREIGN KEY ("scanEventId") REFERENCES "audit_scan_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_reconciliation_items_campaignId_classification_idx"
  ON "audit_reconciliation_items"("campaignId", "classification");

-- ── Adjustments ──────────────────────────────────────────────────────────────
CREATE TABLE "audit_adjustments" (
  "id"                   TEXT         NOT NULL,
  "campaignId"           TEXT         NOT NULL,
  "reconciliationItemId" TEXT         NOT NULL,
  "adjustmentType"       TEXT         NOT NULL,
  "fieldChanged"         TEXT,
  "valueBefore"          TEXT,
  "valueAfter"           TEXT,
  "justification"        TEXT         NOT NULL,
  "postedBy"             TEXT         NOT NULL,
  "postedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedToRegister"    BOOLEAN      NOT NULL DEFAULT false,
  "appliedAt"            TIMESTAMP(3),

  CONSTRAINT "audit_adjustments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_adjustments"
  ADD CONSTRAINT "audit_adjustments_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_adjustments"
  ADD CONSTRAINT "audit_adjustments_reconciliationItemId_fkey"
  FOREIGN KEY ("reconciliationItemId") REFERENCES "audit_reconciliation_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "audit_adjustments_campaignId_idx"
  ON "audit_adjustments"("campaignId");
