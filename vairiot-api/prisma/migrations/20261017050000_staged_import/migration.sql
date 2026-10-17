-- Phase 2, stage 2.13 (S2.5): the staged register import.
--
-- A batch is uploaded to MinIO, then parsed, mapped, validated and committed
-- by worker jobs; each row keeps its raw cells, its mapped values, its status
-- and its messages, and the asset it became. Mappings can be saved per tenant.

CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'VALIDATING', 'VALIDATED', 'COMMITTING', 'COMMITTED', 'FAILED', 'CANCELLED');
CREATE TYPE "ImportMode" AS ENUM ('CREATE', 'UPDATE');
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'WARNING', 'ERROR', 'COMMITTED');

CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mode" "ImportMode" NOT NULL DEFAULT 'CREATE',
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "sheetName" TEXT,
    "headerRow" INTEGER,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mapping" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "committedCount" INTEGER NOT NULL DEFAULT 0,
    "jobError" TEXT,
    "createdBy" TEXT NOT NULL,
    "committedBy" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_batches_size_check" CHECK ("fileSize" > 0 AND "fileSize" <= 26214400)
);
CREATE INDEX "import_batches_tenantId_createdAt_idx" ON "import_batches"("tenantId", "createdAt");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "mapped" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "assetId" TEXT,
    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_rows_batchId_rowNumber_key" ON "import_rows"("batchId", "rowNumber");
CREATE INDEX "import_rows_batchId_status_idx" ON "import_rows"("batchId", "status");
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "import_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_mappings_tenantId_name_key" ON "import_mappings"("tenantId", "name");
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (D5).
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "import_batches"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_rows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "import_rows"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "import_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "import_mappings"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
