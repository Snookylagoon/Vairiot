import { prisma } from '../../lib/prisma';
import { runWithTenant, withoutTenantScope } from '../../lib/tenant-context';

// Row-level security (D5, stage 1.19): inside a tenant scope the database
// itself returns only that tenant's assets, audit events and photos, even
// to queries with no tenant filter.

const A = 'test-rls-tenant-a';
const B = 'test-rls-tenant-b';

beforeAll(async () => {
  for (const id of [A, B]) {
    await prisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: id } });
    await prisma.asset.create({ data: { tenantId: id, assetNumber: `RLS-${id}`, name: `Asset of ${id}` } });
    await prisma.auditEvent.create({ data: { tenantId: id, entityType: 'asset', entityId: 'x', action: 'created' } });
  }
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.asset.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

const ours = { tenantId: { in: [A, B] } };

describe('inside a tenant scope', () => {
  it('lets a tenant write its own rows', async () => {
    const own = await runWithTenant(A, async () => await prisma.asset.create({ data: { tenantId: A, assetNumber: 'RLS-own', name: 'Own' } }));
    expect(own.tenantId).toBe(A);
    await prisma.asset.delete({ where: { id: own.id } });
  });

  it('returns only that tenant’s rows to an unfiltered query', async () => {
    const assets = await runWithTenant(A, async () => await prisma.asset.findMany({ where: { assetNumber: { startsWith: 'RLS-' } } }));
    expect(assets.map((a) => a.tenantId)).toEqual([A]);
    const events = await runWithTenant(B, async () => await prisma.auditEvent.count({ where: ours }));
    expect(events).toBe(1);
  });

  it('applies to raw SQL and runs as the unprivileged role', async () => {
    const rows = await runWithTenant(A, async () => await prisma.$queryRaw<{ n: bigint; who: string }[]>`
      SELECT count(*) AS n, current_user AS who FROM "assets" WHERE "assetNumber" LIKE 'RLS-%'`);
    expect(Number(rows[0].n)).toBe(1);
    expect(rows[0].who).toBe('vairiot_rls');
  });

  it('refuses to write another tenant’s row', async () => {
    await expect(runWithTenant(A, async () => await prisma.asset.create({
      data: { tenantId: B, assetNumber: 'RLS-smuggled', name: 'Smuggled' },
    }))).rejects.toThrow();
    const updated = await runWithTenant(A, async () => await prisma.asset.updateMany({ where: { tenantId: B }, data: { name: 'Hacked' } }));
    expect(updated.count).toBe(0);
  });

  it('holds inside a transaction too', async () => {
    const n = await runWithTenant(A, async () => await prisma.$transaction(async (tx) => tx.asset.count({ where: ours })));
    expect(n).toBe(1);
  });
});

describe('outside a tenant scope', () => {
  it('sees every tenant, for workers, seeds and the family counts', async () => {
    expect(await prisma.asset.count({ where: ours })).toBe(2);
    const n = await runWithTenant(A, async () => await withoutTenantScope(() => prisma.asset.count({ where: ours })));
    expect(n).toBe(2);
  });

  it('does not leak a scope to the next query on the same connection', async () => {
    await runWithTenant(A, async () => await prisma.asset.count());
    const rows = await prisma.$queryRaw<{ who: string }[]>`SELECT current_user AS who`;
    expect(rows[0].who).not.toBe('vairiot_rls');
  });
});

describe('startup check', () => {
  it('passes when the role exists and is granted', async () => {
    const { assertRlsRole } = await import('../../lib/rls-check');
    await expect(assertRlsRole()).resolves.toBeUndefined();
  });
});
