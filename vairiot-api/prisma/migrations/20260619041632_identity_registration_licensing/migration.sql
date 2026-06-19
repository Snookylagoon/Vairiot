-- CreateEnum
CREATE TYPE "DeploymentMode" AS ENUM ('standalone', 'saas', 'hybrid');

-- CreateEnum
CREATE TYPE "LicenceStatus" AS ENUM ('active', 'expiring', 'expired', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "LicenceTierName" AS ENUM ('FREE', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('user_registration', 'company_registration', 'client_registration', 'licence_activation');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "deploymentMode" "DeploymentMode" NOT NULL DEFAULT 'standalone',
ADD COLUMN     "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "licence_tiers" (
    "id" TEXT NOT NULL,
    "name" "LicenceTierName" NOT NULL,
    "displayName" TEXT NOT NULL,
    "maxAssets" INTEGER NOT NULL,
    "baseDevices" INTEGER NOT NULL DEFAULT 1,
    "pricePerYear" DECIMAL(10,2) NOT NULL,
    "pricePerDevice" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "isPerpetual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licence_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "status" "LicenceStatus" NOT NULL DEFAULT 'active',
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "paymentConfirmedAt" TIMESTAMP(3),
    "paymentConfirmedBy" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'handheld',
    "serialNumber" TEXT,
    "hardwareId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_slots" (
    "id" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "registrationNumber" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_companies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "registrationNumber" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactPhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_authorities" (
    "id" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "isSignatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "step" "OnboardingStep" NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_two_factor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT[],
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licence_tiers_name_key" ON "licence_tiers"("name");

-- CreateIndex
CREATE INDEX "licences_tenantId_status_idx" ON "licences"("tenantId", "status");

-- CreateIndex
CREATE INDEX "devices_tenantId_active_idx" ON "devices"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_hardwareId_key" ON "devices"("tenantId", "hardwareId");

-- CreateIndex
CREATE INDEX "device_slots_licenceId_idx" ON "device_slots"("licenceId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenantId_key" ON "companies"("tenantId");

-- CreateIndex
CREATE INDEX "client_companies_tenantId_idx" ON "client_companies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "client_companies_tenantId_legalName_key" ON "client_companies"("tenantId", "legalName");

-- CreateIndex
CREATE INDEX "client_authorities_clientCompanyId_idx" ON "client_authorities"("clientCompanyId");

-- CreateIndex
CREATE INDEX "onboarding_progress_tenantId_idx" ON "onboarding_progress"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_tenantId_step_key" ON "onboarding_progress"("tenantId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "user_two_factor_userId_key" ON "user_two_factor"("userId");

-- CreateIndex
CREATE INDEX "login_attempts_userId_createdAt_idx" ON "login_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "assets_tenantId_deletedAt_idx" ON "assets"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "locations_parentId_idx" ON "locations"("parentId");

-- CreateIndex
CREATE INDEX "maintenance_events_tenantId_status_scheduledDate_idx" ON "maintenance_events"("tenantId", "status", "scheduledDate");

-- AddForeignKey
ALTER TABLE "licences" ADD CONSTRAINT "licences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licences" ADD CONSTRAINT "licences_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "licence_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_slots" ADD CONSTRAINT "device_slots_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_companies" ADD CONSTRAINT "client_companies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_authorities" ADD CONSTRAINT "client_authorities_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "client_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_two_factor" ADD CONSTRAINT "user_two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
