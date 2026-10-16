-- Phase 2, stage 2.3 (S2.1): IPSAS asset classes, recognition and acquisition.
--
-- AssetClass holds the policies the Accounting Policy Manual (TOR D2) sets:
-- capitalisation threshold, default life, method and residual, GL accounts.
-- Assets gain their class, how they were acquired, the capitalised cost and a
-- recognition status. Tenants with `ipsas` on have their existing assets
-- marked PENDING_REVIEW for Finance to classify (D20); others are untouched.

CREATE TYPE "IpsasClass" AS ENUM ('INFRASTRUCTURE', 'OPERATIONAL', 'OFFICE_EQUIPMENT', 'FURNITURE', 'VEHICLES', 'LAND', 'BUILDINGS', 'OTHER');
CREATE TYPE "AcquisitionType" AS ENUM ('PURCHASE', 'DONATION', 'TRANSFER_IN', 'CONSTRUCTION', 'FINANCE_LEASE', 'OTHER');
CREATE TYPE "RecognitionStatus" AS ENUM ('RECOGNISED', 'EXPENSED', 'PENDING_REVIEW');

CREATE TABLE "asset_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipsasClass" "IpsasClass" NOT NULL,
    "capitalisationThreshold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defaultUsefulLifeMonths" INTEGER,
    "defaultDepreciationMethod" TEXT NOT NULL DEFAULT 'straight_line',
    "defaultResidualPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "componentisationRequired" BOOLEAN NOT NULL DEFAULT false,
    "glAssetAccount" TEXT,
    "glDepreciationAccount" TEXT,
    "glAccumulatedDepreciationAccount" TEXT,
    "glImpairmentAccount" TEXT,
    "toBeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_classes_threshold_check" CHECK ("capitalisationThreshold" >= 0),
    CONSTRAINT "asset_classes_life_check" CHECK ("defaultUsefulLifeMonths" IS NULL OR "defaultUsefulLifeMonths" > 0),
    CONSTRAINT "asset_classes_residual_check" CHECK ("defaultResidualPct" BETWEEN 0 AND 100),
    CONSTRAINT "asset_classes_method_check" CHECK ("defaultDepreciationMethod" IN ('straight_line', 'declining_balance', 'units_of_production', 'none'))
);
CREATE UNIQUE INDEX "asset_classes_tenantId_code_key" ON "asset_classes"("tenantId", "code");
CREATE INDEX "asset_classes_tenantId_idx" ON "asset_classes"("tenantId");
ALTER TABLE "asset_classes" ADD CONSTRAINT "asset_classes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation, as on assets (D5): a new tenant table gets its policy here.
ALTER TABLE "asset_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_classes"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));

ALTER TABLE "categories" ADD COLUMN "assetClassId" TEXT;
ALTER TABLE "categories" ADD CONSTRAINT "categories_assetClassId_fkey"
  FOREIGN KEY ("assetClassId") REFERENCES "asset_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets"
  ADD COLUMN "assetClassId" TEXT,
  ADD COLUMN "acquisitionType" "AcquisitionType" NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN "fairValueAtRecognition" DECIMAL(12,2),
  ADD COLUMN "sourceEntity" TEXT,
  ADD COLUMN "recognitionDate" TIMESTAMP(3),
  ADD COLUMN "capitalisedCost" DECIMAL(12,2),
  ADD COLUMN "recognitionStatus" "RecognitionStatus",
  ADD COLUMN "recognitionOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recognitionOverrideReason" TEXT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetClassId_fkey"
  FOREIGN KEY ("assetClassId") REFERENCES "asset_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_capitalised_cost_check" CHECK ("capitalisedCost" IS NULL OR "capitalisedCost" >= 0);
ALTER TABLE "assets" ADD CONSTRAINT "assets_fair_value_check" CHECK ("fairValueAtRecognition" IS NULL OR "fairValueAtRecognition" >= 0);
ALTER TABLE "assets" ADD CONSTRAINT "assets_override_reason_check"
  CHECK (NOT "recognitionOverride" OR "recognitionOverrideReason" IS NOT NULL);
CREATE INDEX "assets_tenantId_assetClassId_idx" ON "assets"("tenantId", "assetClassId");
CREATE INDEX "assets_tenantId_recognitionStatus_idx" ON "assets"("tenantId", "recognitionStatus");

-- Back-fill: the capitalised cost every asset already implies, then
-- PENDING_REVIEW for the tenants keeping an IPSAS ledger (no class yet).
UPDATE "assets"
SET "capitalisedCost" = COALESCE("purchaseCost", 0) + COALESCE("freightCost", 0) + COALESCE("installationCost", 0)
                      + COALESCE("customsDuties", 0) + COALESCE("otherCapitalizedCosts", 0)
WHERE "purchaseCost" IS NOT NULL;

UPDATE "assets" a
SET "recognitionStatus" = 'PENDING_REVIEW'
FROM "tenants" t
WHERE a."tenantId" = t."id" AND a."deletedAt" IS NULL
  AND (t."featureFlags" ->> 'ipsas') = 'true';
