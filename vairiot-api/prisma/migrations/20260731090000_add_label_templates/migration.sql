-- CreateTable
CREATE TABLE "label_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "label_templates_tenantId_idx" ON "label_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "label_templates_tenantId_name_key" ON "label_templates"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
