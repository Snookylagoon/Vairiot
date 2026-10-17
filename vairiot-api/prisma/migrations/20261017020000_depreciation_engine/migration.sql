-- Phase 2, stage 2.8 (S2.3): accounting periods, depreciation runs and entries.
--
-- Monthly periods in the tenant's time zone (D15). A run is prepared as a
-- DRAFT with a preview and posted by a different user (D17); posting writes
-- one entry per asset and closes the period. Entries are append-only: a
-- mistake is corrected by reversing the run, which writes offsetting entries.

CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');
CREATE TYPE "RunStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'DISCARDED');

ALTER TABLE "assets"
  ADD COLUMN "reducingBalanceRatePct" DECIMAL(7,4),
  ADD COLUMN "expectedTotalUnits" DECIMAL(16,2);
ALTER TABLE "assets" ADD CONSTRAINT "assets_reducing_rate_check"
  CHECK ("reducingBalanceRatePct" IS NULL OR ("reducingBalanceRatePct" > 0 AND "reducingBalanceRatePct" <= 100));
ALTER TABLE "assets" ADD CONSTRAINT "assets_expected_units_check"
  CHECK ("expectedTotalUnits" IS NULL OR "expectedTotalUnits" > 0);

CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_periods_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "accounting_periods_year_check" CHECK ("year" BETWEEN 2000 AND 2100)
);
CREATE UNIQUE INDEX "accounting_periods_tenantId_year_month_key" ON "accounting_periods"("tenantId", "year", "month");
CREATE INDEX "accounting_periods_tenantId_idx" ON "accounting_periods"("tenantId");
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "depreciation_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "preview" JSONB,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "totalCharge" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "preparedBy" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalOfRunId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "depreciation_runs_pkey" PRIMARY KEY ("id"),
    -- D17: whoever prepared a run cannot post it.
    CONSTRAINT "depreciation_runs_separate_poster_check" CHECK ("postedBy" IS NULL OR "postedBy" <> "preparedBy")
);
CREATE UNIQUE INDEX "depreciation_runs_reversalOfRunId_key" ON "depreciation_runs"("reversalOfRunId");
CREATE INDEX "depreciation_runs_tenantId_periodId_idx" ON "depreciation_runs"("tenantId", "periodId");
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_reversalOfRunId_fkey"
  FOREIGN KEY ("reversalOfRunId") REFERENCES "depreciation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "depreciation_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "openingNbv" DECIMAL(12,2) NOT NULL,
    "charge" DECIMAL(12,2) NOT NULL,
    "closingNbv" DECIMAL(12,2) NOT NULL,
    "accumulated" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "depreciation_entries_balance_check" CHECK ("closingNbv" = "openingNbv" - "charge")
);
CREATE UNIQUE INDEX "depreciation_entries_assetId_runId_key" ON "depreciation_entries"("assetId", "runId");
CREATE INDEX "depreciation_entries_tenantId_assetId_idx" ON "depreciation_entries"("tenantId", "assetId");
CREATE INDEX "depreciation_entries_tenantId_periodId_idx" ON "depreciation_entries"("tenantId", "periodId");
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "depreciation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only (D17), as asset_events: corrections are reversals, never edits.
CREATE OR REPLACE FUNCTION depreciation_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'depreciation_entries is append-only (%)', TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "depreciation_entries_append_only"
  BEFORE UPDATE OR DELETE ON "depreciation_entries"
  FOR EACH ROW EXECUTE FUNCTION depreciation_entries_append_only();

CREATE TABLE "asset_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "units" DECIMAL(16,2) NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_usage_units_check" CHECK ("units" >= 0)
);
CREATE UNIQUE INDEX "asset_usage_assetId_periodId_key" ON "asset_usage"("assetId", "periodId");
CREATE INDEX "asset_usage_tenantId_periodId_idx" ON "asset_usage"("tenantId", "periodId");
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (D5) on every new tenant table.
ALTER TABLE "accounting_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "accounting_periods"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "depreciation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depreciation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depreciation_runs"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "depreciation_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depreciation_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depreciation_entries"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "asset_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_usage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_usage"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
