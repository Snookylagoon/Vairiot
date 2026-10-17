import { prisma } from '../../lib/prisma';
import { createAsset } from '../../services/asset.service';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// KFR-045 (stage 2.13): a tenant's identifier sequence is created on its first
// GS1 reference. Allocations arriving together for a new tenant used to race
// on `CREATE SEQUENCE IF NOT EXISTS` and all but one failed on pg_class's
// unique index. They now queue on the tenant's advisory lock.

const TIDS = ['test-iar-race-sql', 'test-iar-race-assets'];

beforeAll(async () => {
  for (const id of TIDS) await prisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: id, onboardingComplete: true } });
  await ensureTestLicence(TIDS[1]);
});

afterAll(async () => {
  await flushAuditEvents();
  for (const id of TIDS) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.identifierAllocation.deleteMany({ where: { tenantId: id } });
    const seq = (await prisma.$queryRaw<Array<{ n: string }>>`SELECT asset_reference_seq_name(${id}) AS n`)[0].n;
    await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${seq}"`);
  }
  await removeTestLicence(TIDS[1]);
  await prisma.user.deleteMany({ where: { tenantId: { in: TIDS } } });
  await prisma.tenant.deleteMany({ where: { id: { in: TIDS } } });
  await prisma.$disconnect();
});

it('allocates distinct references when a new tenant’s first allocations arrive together', async () => {
  const iars = await Promise.all(Array.from({ length: 12 }, () =>
    prisma.$queryRaw<Array<{ allocate_iar: string }>>`SELECT allocate_iar(${TIDS[0]}, ${null}, ${'TEST'})`.then((r) => r[0].allocate_iar)));
  expect(new Set(iars).size).toBe(12);
});

it('creates every asset when a new tenant’s first creates arrive together', async () => {
  const user = await prisma.user.create({ data: { tenantId: TIDS[1], email: 'race@race.test', name: 'race' } });
  const settled = await Promise.allSettled(Array.from({ length: 8 }, (_, i) =>
    createAsset(TIDS[1], user.id, { name: `Asset ${i}` }, `AST-${String(i + 1).padStart(6, '0')}`)));
  expect(settled.filter((s) => s.status === 'rejected')).toEqual([]);
  expect(await prisma.asset.count({ where: { tenantId: TIDS[1] } })).toBe(8);
});

it('keeps running as its owner with a pinned search path, as row-level security needs', async () => {
  const [f] = await prisma.$queryRaw<Array<{ prosecdef: boolean; proconfig: string[] }>>`
    SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'provision_tenant_identifier_seq'`;
  expect(f.prosecdef).toBe(true);
  expect(f.proconfig).toEqual(['search_path=public, pg_temp']);
});
