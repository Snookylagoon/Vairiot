-- S0.6: tenant-local time zone (TUDA: Asia/Tbilisi)
-- AlterTable
ALTER TABLE "companies" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
