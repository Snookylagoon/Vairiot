-- Phase 2, stage 2.5 (S2.2): assets held as parts, and templates for them.
--
-- IPSAS 45 depreciates significant parts with different lives separately, so
-- a signalised junction is a parent with its controller, poles, heads and
-- detectors as components. One level only, within one tenant: a trigger
-- refuses deeper nesting, a parent of itself, and a parent in another tenant.

ALTER TABLE "assets"
  ADD COLUMN "parentAssetId" TEXT,
  ADD COLUMN "componentRole" TEXT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentAssetId_fkey"
  FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_not_own_parent_check" CHECK ("parentAssetId" IS NULL OR "parentAssetId" <> "id");
ALTER TABLE "assets" ADD CONSTRAINT "assets_component_role_check"
  CHECK ("componentRole" IS NULL OR ("parentAssetId" IS NOT NULL AND length("componentRole") BETWEEN 1 AND 40));
CREATE INDEX "assets_tenantId_parentAssetId_idx" ON "assets"("tenantId", "parentAssetId");

CREATE OR REPLACE FUNCTION assets_component_depth() RETURNS trigger AS $$
DECLARE
  parent_tenant TEXT;
  grandparent TEXT;
BEGIN
  IF NEW."parentAssetId" IS NULL THEN
    RETURN NEW;
  END IF;
  -- Under row-level security a parent in another tenant is not visible, so
  -- it reads as no tenant and is refused like any other mismatch.
  SELECT "tenantId", "parentAssetId" INTO parent_tenant, grandparent FROM "assets" WHERE "id" = NEW."parentAssetId";
  IF parent_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'component and parent must belong to the same tenant' USING ERRCODE = 'check_violation';
  END IF;
  IF grandparent IS NOT NULL THEN
    RAISE EXCEPTION 'a component cannot have components' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "assets" WHERE "parentAssetId" = NEW."id") THEN
    RAISE EXCEPTION 'an asset with components cannot become a component' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assets_component_depth"
  BEFORE INSERT OR UPDATE OF "parentAssetId" ON "assets"
  FOR EACH ROW EXECUTE FUNCTION assets_component_depth();

CREATE TABLE "component_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClassId" TEXT,
    "lines" JSONB NOT NULL,
    "toBeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "component_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "component_templates_lines_check" CHECK (jsonb_typeof("lines") = 'array')
);
CREATE UNIQUE INDEX "component_templates_tenantId_code_key" ON "component_templates"("tenantId", "code");
CREATE INDEX "component_templates_tenantId_idx" ON "component_templates"("tenantId");
ALTER TABLE "component_templates" ADD CONSTRAINT "component_templates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "component_templates" ADD CONSTRAINT "component_templates_assetClassId_fkey"
  FOREIGN KEY ("assetClassId") REFERENCES "asset_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation (D5), as on every new tenant table.
ALTER TABLE "component_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "component_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "component_templates"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
