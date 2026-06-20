-- DropIndex
DROP INDEX IF EXISTS "tenants_slug_key";

-- AlterTable: remove slug, add unique constraint on name
ALTER TABLE "tenants" DROP COLUMN "slug";

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");
