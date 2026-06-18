-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "capitalizationDate" TIMESTAMP(3),
ADD COLUMN     "customsDuties" DECIMAL(12,2),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "depreciationMethod" TEXT DEFAULT 'straight_line',
ADD COLUMN     "depreciationStartDate" TIMESTAMP(3),
ADD COLUMN     "freightCost" DECIMAL(12,2),
ADD COLUMN     "installationCost" DECIMAL(12,2),
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "otherCapitalizedCosts" DECIMAL(12,2),
ADD COLUMN     "purchaseOrderNumber" TEXT,
ADD COLUMN     "receiptDate" TIMESTAMP(3),
ADD COLUMN     "residualValue" DECIMAL(12,2),
ADD COLUMN     "usefulLifeMonths" INTEGER;

-- AlterTable
ALTER TABLE "photos" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "disposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "disposalDate" TIMESTAMP(3) NOT NULL,
    "disposalMethod" TEXT NOT NULL,
    "disposalValue" DECIMAL(12,2),
    "disposalReason" TEXT,
    "netBookValueAtDisposal" DECIMAL(12,2),
    "gainLoss" DECIMAL(12,2),
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disposals_assetId_key" ON "disposals"("assetId");

-- CreateIndex
CREATE INDEX "disposals_tenantId_idx" ON "disposals"("tenantId");

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
