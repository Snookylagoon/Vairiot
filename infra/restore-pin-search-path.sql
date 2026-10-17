-- Pins the search path of Vairiot's own database functions (KFR-046).
-- pg_restore runs with an empty search_path, so a function that names another
-- of ours, or PostGIS's, without a schema fails while the data loads: a CHECK
-- constraint calls is_valid_iar(), which calls gs1_check_digit(). The
-- restore scripts run this between the schema and the data, so dumps taken
-- before migration 20261017080000 restore too. rls_tenant_matches() is left
-- alone: it uses only built-ins, and pinning would stop it being inlined into
-- every row-level-security check. Extension functions are not ours to change.
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
