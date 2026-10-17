-- Phase 2, stage 2.11 (S2.4): impairment and its reversal (IPSAS 21 / 26).
--
-- A record is raised as a DRAFT from an indicator (a grade whose scale entry
-- has impairmentIndicator, or by hand), assessed, and posted into an open
-- period by someone other than the assessor (D17). `loss` is positive for an
-- impairment, negative for a reversal of one. Posted records are not edited:
-- a mistake is corrected by an offsetting record (`correctionOfId`), and the
-- only change a posted row may take is being marked REVERSED.

CREATE TYPE "ImpairmentIndicator" AS ENUM ('CONDITION', 'DAMAGE', 'OBSOLESCENCE', 'IDLE', 'LEGAL', 'OTHER');
CREATE TYPE "ImpairmentStandard" AS ENUM ('IPSAS_21', 'IPSAS_26');
CREATE TYPE "ImpairmentMethod" AS ENUM ('DRC', 'RESTORATION_COST', 'SERVICE_UNITS', 'FVLCS');
CREATE TYPE "ImpairmentKind" AS ENUM ('IMPAIRMENT', 'REVERSAL');
CREATE TYPE "ImpairmentStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'DISMISSED');

CREATE TABLE "impairments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "ImpairmentKind" NOT NULL DEFAULT 'IMPAIRMENT',
    "status" "ImpairmentStatus" NOT NULL DEFAULT 'DRAFT',
    "indicator" "ImpairmentIndicator" NOT NULL,
    "indicatorNotes" TEXT,
    "conditionGrade" INTEGER,
    "standard" "ImpairmentStandard",
    "method" "ImpairmentMethod",
    "carryingAmount" DECIMAL(12,2),
    "recoverableAmount" DECIMAL(12,2),
    "loss" DECIMAL(12,2),
    "assessmentNotes" TEXT,
    "evidencePhotoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "periodId" TEXT,
    "correctionOfId" TEXT,
    "raisedBy" TEXT,
    "assessedBy" TEXT,
    "assessedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "impairments_pkey" PRIMARY KEY ("id"),
    -- D17: whoever assessed it cannot post it.
    CONSTRAINT "impairments_separate_poster_check" CHECK ("postedBy" IS NULL OR "assessedBy" IS NULL OR "postedBy" <> "assessedBy"),
    -- A posted record has its figures and its period.
    CONSTRAINT "impairments_posted_complete_check" CHECK (
      "status" IN ('DRAFT', 'DISMISSED') OR ("loss" IS NOT NULL AND "periodId" IS NOT NULL AND "postedBy" IS NOT NULL)),
    CONSTRAINT "impairments_amounts_check" CHECK (
      ("carryingAmount" IS NULL OR "carryingAmount" >= 0) AND ("recoverableAmount" IS NULL OR "recoverableAmount" >= 0)),
    CONSTRAINT "impairments_grade_check" CHECK ("conditionGrade" IS NULL OR "conditionGrade" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "impairments_correctionOfId_key" ON "impairments"("correctionOfId");
CREATE INDEX "impairments_tenantId_status_idx" ON "impairments"("tenantId", "status");
CREATE INDEX "impairments_tenantId_assetId_idx" ON "impairments"("tenantId", "assetId");
-- One open draft per asset: a second indicator joins the first.
CREATE UNIQUE INDEX "impairments_one_draft_per_asset" ON "impairments"("assetId") WHERE "status" = 'DRAFT';
ALTER TABLE "impairments" ADD CONSTRAINT "impairments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impairments" ADD CONSTRAINT "impairments_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impairments" ADD CONSTRAINT "impairments_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impairments" ADD CONSTRAINT "impairments_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "impairments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Posted records are append-only (D17): not deleted, and only marked REVERSED.
CREATE OR REPLACE FUNCTION impairments_posted_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'a posted impairment cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'REVERSED'
     OR (OLD."status" = 'POSTED' AND (NEW."status" <> 'REVERSED'
       OR (to_jsonb(NEW) - ARRAY['status', 'reversedBy', 'reversedAt', 'updatedAt']) <> (to_jsonb(OLD) - ARRAY['status', 'reversedBy', 'reversedAt', 'updatedAt']))) THEN
    RAISE EXCEPTION 'a posted impairment is corrected by an offsetting record, not edited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "impairments_posted_immutable"
  BEFORE UPDATE OR DELETE ON "impairments"
  FOR EACH ROW EXECUTE FUNCTION impairments_posted_immutable();

-- Tenant isolation (D5).
ALTER TABLE "impairments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impairments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "impairments"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
