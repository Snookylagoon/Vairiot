-- AlterTable
ALTER TABLE "photos" ADD COLUMN "thumbStorageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "photos_thumbStorageKey_key" ON "photos"("thumbStorageKey");
