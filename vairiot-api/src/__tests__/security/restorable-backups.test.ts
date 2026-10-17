import { readFileSync } from 'fs';
import path from 'path';

import { prisma } from '../../lib/prisma';

// KFR-046 (stage 3.1): a backup must restore. pg_restore runs with an empty
// search_path, so a function that names another of ours (or PostGIS's)
// without a schema fails while the rows load: a CHECK on assets calls
// is_valid_iar(), which calls gs1_check_digit(). Staging's restore test failed
// on it, and restore.sh, which did not stop on errors, would have dropped
// every asset with a GS1 reference.

const INFRA = path.resolve(__dirname, '../../../../infra');
const read = (f: string) => readFileSync(path.join(INFRA, f), 'utf8');

it('pins the search path of every Vairiot function but the inlined RLS check', async () => {
  const unpinned = await prisma.$queryRaw<Array<{ fn: string }>>`
    SELECT p.oid::regprocedure::text AS fn FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proconfig IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY 1`;
  expect(unpinned.map((r) => r.fn)).toEqual(['rls_tenant_matches(text)']);
});

it('keeps the RLS check inlinable: it uses only built-ins', async () => {
  const [f] = await prisma.$queryRaw<Array<{ body: string }>>`SELECT prosrc AS body FROM pg_proc WHERE proname = 'rls_tenant_matches'`;
  expect(f.body.replace(/current_setting|coalesce/g, '')).not.toMatch(/\b[a-z_]+\s*\(/);
});

it.each(['restore.sh', 'restore-test.sh'])('%s restores in sections: schema, the pin, rows with triggers off, then the rest', (file) => {
  const s = read(file);
  const at = (needle: string) => { const i = s.indexOf(needle); expect([file, needle, i >= 0]).toEqual([file, needle, true]); return i; };
  const pre = at('--section=pre-data');
  const pin = at('restore-pin-search-path.sql');
  const data = at('--section=data --disable-triggers');
  const post = at('--section=post-data');
  expect(pre < pin && pin < data && data < post).toBe(true);
  expect(s).toContain('--exit-on-error');
});

it('the restore snippet and the migration pin the same functions', () => {
  const body = (t: string) => t.slice(t.indexOf('DO $$')).trim();
  const migration = readFileSync(path.resolve(__dirname, '../../../prisma/migrations/20261017080000_function_search_path/migration.sql'), 'utf8');
  expect(body(migration)).toBe(body(read('restore-pin-search-path.sql')));
});
