-- Add tenant currency (3-letter ISO 4217 code) to Company
ALTER TABLE "companies" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
