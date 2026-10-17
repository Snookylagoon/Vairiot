import { prisma } from '../../lib/prisma';

// G23 (stage 2.15, W7): every tenant table has row-level security, enabled and
// forced, with a policy; so does every child table that reaches its tenant
// through a parent. A table added with a tenantId and no policy fails here.

/** Tables without a tenantId that are scoped through a parent row. */
const CHILDREN = [
  'user_permission_overrides', 'user_roles', 'user_two_factor', 'locations', 'audit_campaign_assets', 'audit_snapshot_assets',
  'audit_zone_submissions', 'audit_reconciliation_items', 'audit_adjustments', 'scan_session_tags', 'device_slots', 'client_authorities',
];
/** Platform tables, deliberately not tenant-scoped (the migration says why), and PostGIS's own. */
const PLATFORM = ['tenants', 'licence_tiers', 'mobile_releases', 'ios_releases', 'ios_devices', 'smtp_config', 'login_attempts', '_prisma_migrations', 'spatial_ref_sys'];

type Row = { table: string; rls: boolean; forced: boolean; policies: number; tenant: boolean };

it('scopes every tenant table and every child table, leaving only the platform tables', async () => {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.relname AS "table", c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
           EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'tenantId') AS tenant
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`;
  const scoped = (r: Row) => r.rls && r.forced && r.policies > 0;
  expect(rows.filter((r) => r.tenant && !scoped(r)).map((r) => r.table)).toEqual([]);
  expect(rows.filter((r) => CHILDREN.includes(r.table) && !scoped(r)).map((r) => r.table)).toEqual([]);
  // Anything else unscoped must be a known platform table, so a new child table is a decision, not an accident.
  const unscoped = rows.filter((r) => !scoped(r)).map((r) => r.table).sort();
  expect(unscoped.filter((t) => !PLATFORM.includes(t))).toEqual([]);
  expect(rows.filter((r) => r.tenant).length).toBeGreaterThanOrEqual(50);
});
