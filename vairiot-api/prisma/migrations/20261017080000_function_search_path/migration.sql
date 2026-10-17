-- KFR-046 (stage 3.1): every Vairiot function gets a pinned search path, so a
-- database dump restores (pg_restore runs with an empty search_path). The same
-- statement is infra/restore-pin-search-path.sql, which the restore scripts run
-- for dumps taken before this migration.

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proconfig IS NULL
      AND p.proname <> 'rls_tenant_matches'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
  END LOOP;
END
$$;
