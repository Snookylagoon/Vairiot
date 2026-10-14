import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';

// KFR-040: requireActiveLicence, requireTenantScope and requireClientScope were
// defined but never mounted. Client-plane roles could write anything their
// router allowed, an expired tenant kept full write access, and nothing stopped
// a tenant user naming another tenant.

const app = createApp();
const ROOT = 'test-scope-root';
const SUB = 'test-scope-sub';
let licenceId = '';
let userId = '';

function tokenFor(tenantId: string, roles: string[], permissions: string[]) {
  return signAccessToken({ sub: userId, tenantId, email: 'scope@scope.test', roles, permissions });
}
const staff = (tenantId = ROOT) => tokenFor(tenantId, ['Asset Manager'], ['asset:read', 'asset:write', 'category:read', 'category:write']);
const client = () => tokenFor(ROOT, ['Client Stakeholder'], ['asset:read', 'category:read', 'report:read']);

async function setLicence(data: { status?: 'active' | 'suspended' | 'expired'; expiresAt?: Date | null; gracePeriodDays?: number }) {
  await prisma.licence.update({ where: { id: licenceId }, data });
}
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const newCategory = (token: string) =>
  request(app).post('/api/v1/categories').set('Authorization', `Bearer ${token}`)
    .send({ name: `Cat ${Math.random().toString(36).slice(2, 8)}` });

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: ROOT }, update: { onboardingComplete: true },
    create: { id: ROOT, name: 'Scope root', onboardingComplete: true },
  });
  await prisma.tenant.upsert({
    where: { id: SUB }, update: { onboardingComplete: true, parentTenantId: ROOT },
    create: { id: SUB, name: 'Scope sub', onboardingComplete: true, parentTenantId: ROOT },
  });
  userId = (await prisma.user.upsert({
    where: { tenantId_email: { tenantId: ROOT, email: 'scope@scope.test' } },
    update: {}, create: { tenantId: ROOT, email: 'scope@scope.test', name: 'Scope tester' },
  })).id;
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0, isPerpetual: true },
  });
  licenceId = (await prisma.licence.create({
    data: {
      tenantId: ROOT, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true,
      licenceNumber: `VAI-SCOPE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  })).id;
});

afterEach(() => setLicence({ status: 'active', expiresAt: null, gracePeriodDays: 14 }));

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: { in: [ROOT, SUB] } } });
  await prisma.category.deleteMany({ where: { tenantId: { in: [ROOT, SUB] } } });
  await prisma.licence.deleteMany({ where: { tenantId: ROOT } });
  await prisma.user.deleteMany({ where: { tenantId: ROOT } });
  await prisma.tenant.delete({ where: { id: SUB } });
  await prisma.tenant.delete({ where: { id: ROOT } });
  await prisma.$disconnect();
});

describe('requireClientScope', () => {
  it('lets a client account read', async () => {
    const res = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${client()}`);
    expect(res.status).toBe(200);
  });

  it('refuses every write from a client account, whatever its permissions', async () => {
    const generous = tokenFor(ROOT, ['Client Authority'], ['category:write', 'asset:write']);
    const res = await newCategory(generous);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_READ_ONLY');
  });

  it('does not restrict a tenant-plane user', async () => {
    expect((await newCategory(staff())).status).toBe(201);
  });
});

describe('requireTenantScope', () => {
  it('refuses a tenant user who names another tenant', async () => {
    const res = await request(app).get('/api/v1/categories?tenantId=someone-else')
      .set('Authorization', `Bearer ${staff()}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SCOPE');
  });

  it('accepts a tenant user naming their own tenant', async () => {
    const res = await request(app).get(`/api/v1/categories?tenantId=${ROOT}`)
      .set('Authorization', `Bearer ${staff()}`);
    expect(res.status).toBe(200);
  });
});

describe('requireActiveLicence', () => {
  it('allows writes on an active licence, including from a sub-tenant', async () => {
    expect((await newCategory(staff())).status).toBe(201);
    expect((await newCategory(staff(SUB))).status).toBe(201);
  });

  it('allows writes while expired but inside the grace period', async () => {
    await setLicence({ status: 'expired', expiresAt: daysAgo(3), gracePeriodDays: 14 });
    expect((await newCategory(staff())).status).toBe(201);
  });

  it('blocks writes, not reads, once past the grace period — even if the stored status is stale', async () => {
    await setLicence({ status: 'active', expiresAt: daysAgo(30), gracePeriodDays: 14 });
    const write = await newCategory(staff());
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('LICENCE_EXPIRED');
    const sub = await newCategory(staff(SUB));
    expect(sub.body.code).toBe('LICENCE_EXPIRED');
    const read = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${staff()}`);
    expect(read.status).toBe(200);
  });

  it('blocks writes on a suspended licence', async () => {
    await setLicence({ status: 'suspended' });
    const res = await newCategory(staff());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LICENCE_SUSPENDED');
  });

  it('keeps the licence endpoints open so an expired tenant can renew', async () => {
    await setLicence({ status: 'expired', expiresAt: daysAgo(30), gracePeriodDays: 14 });
    const res = await request(app).post('/api/v1/licences/devices/heartbeat')
      .set('Authorization', `Bearer ${staff()}`).send({ deviceId: 'none' });
    expect(res.body.code).not.toBe('LICENCE_EXPIRED');
  });

  it('lets platform roles through', async () => {
    await setLicence({ status: 'suspended' });
    const platform = tokenFor(ROOT, ['Platform Super Admin'], ['category:write']);
    expect((await newCategory(platform)).status).toBe(201);
  });
});
