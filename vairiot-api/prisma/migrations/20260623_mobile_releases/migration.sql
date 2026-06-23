-- CreateTable
CREATE TABLE "mobile_releases" (
    "id" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_releases_versionCode_key" ON "mobile_releases"("versionCode");
CREATE INDEX "mobile_releases_isCurrent_idx" ON "mobile_releases"("isCurrent");
CREATE INDEX "mobile_releases_versionCode_idx" ON "mobile_releases"("versionCode");
