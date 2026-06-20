-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "parentTenantId" TEXT;

-- CreateIndex
CREATE INDEX "tenants_parentTenantId_idx" ON "tenants"("parentTenantId");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
