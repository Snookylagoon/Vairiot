-- Soft-delete support for users
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "users_tenantId_deletedAt_idx" ON "users"("tenantId", "deletedAt");
