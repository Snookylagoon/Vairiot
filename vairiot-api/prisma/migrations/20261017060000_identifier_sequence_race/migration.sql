-- A tenant's identifier sequence is created on its first GS1 reference
-- (stage 2.13, KFR-045). `CREATE SEQUENCE IF NOT EXISTS` is not safe under
-- concurrency: two first allocations at once both pass the check, and the
-- second fails on pg_class's unique index ("duplicate key value violates
-- unique constraint pg_class_relname_nsp_index"), losing that asset. Found by
-- the staged import's parallel commit; mobile creates arriving together for a
-- new tenant could hit it too.
--
-- Now: return at once when the sequence exists (every allocation after the
-- first); otherwise take the per-tenant advisory lock that block leasing
-- already uses, so creators queue, and treat "already exists" as success.
-- CREATE OR REPLACE resets a function's attributes, so SECURITY DEFINER and
-- the pinned search_path (row-level security migration) are restated.

CREATE OR REPLACE FUNCTION provision_tenant_identifier_seq(p_tenant text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE seq text := asset_reference_seq_name(p_tenant);
BEGIN
  IF to_regclass(quote_ident(seq)) IS NOT NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant));
  BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1 INCREMENT BY 1 NO CYCLE', seq);
  EXCEPTION WHEN unique_violation OR duplicate_table THEN
    NULL; -- created by a caller that did not take the lock (before this fix)
  END;
END $$;
