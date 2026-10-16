-- Row-level security, first tables (decision D5, stage 1.19): assets,
-- audit_events, photos.
--
-- The API switches tenant requests to the role vairiot_rls (lib/rls-pool.ts),
-- because the login role is the superuser, which bypasses RLS even when
-- FORCEd. Outside a tenant request (workers, seeds, migrations, platform
-- administration) app.tenant_id is empty and every row is visible.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vairiot_rls') THEN
    CREATE ROLE vairiot_rls NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- The login role must be able to SET ROLE to it (a superuser always can).
GRANT vairiot_rls TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO vairiot_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vairiot_rls;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vairiot_rls;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vairiot_rls;
-- Tables and sequences added by later migrations (run as this same role).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vairiot_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vairiot_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO vairiot_rls;

-- The identifier functions create a per-tenant sequence on first use. They
-- run as their owner, so the restricted role needs no right to create
-- objects; search_path is pinned, as for any SECURITY DEFINER function.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('provision_tenant_identifier_seq', 'allocate_iar', 'lease_identifier_block')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', f);
  END LOOP;
END
$$;

-- True when no tenant is set, or the row is the current tenant's.
CREATE OR REPLACE FUNCTION rls_tenant_matches(row_tenant TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.tenant_id', true), '') = ''
      OR row_tenant = current_setting('app.tenant_id', true)
$$;
GRANT EXECUTE ON FUNCTION rls_tenant_matches(TEXT) TO vairiot_rls;

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assets"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_events"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));

ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "photos"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
