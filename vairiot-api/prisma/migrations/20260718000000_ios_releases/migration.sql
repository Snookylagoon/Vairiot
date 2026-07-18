-- CreateTable
CREATE TABLE "ios_releases" (
    "id" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ios_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_devices" (
    "id" TEXT NOT NULL,
    "udid" TEXT NOT NULL,
    "product" TEXT,
    "osVersion" TEXT,
    "serial" TEXT,
    "name" TEXT,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ios_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ios_releases_versionCode_key" ON "ios_releases"("versionCode");

-- CreateIndex
CREATE INDEX "ios_releases_isCurrent_idx" ON "ios_releases"("isCurrent");

-- CreateIndex
CREATE INDEX "ios_releases_versionCode_idx" ON "ios_releases"("versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "ios_devices_udid_key" ON "ios_devices"("udid");
