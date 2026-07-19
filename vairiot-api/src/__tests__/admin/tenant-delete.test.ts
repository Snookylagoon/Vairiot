import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();

const PLATFORM_TID = 'test-platform-del';
const TARGET_TID   = 'test-tenant-del-target';
const PASS = 'TestPassword123!';

let superToken = '';

async function createTargetTenant(licenceStatus: 'active' | 'revoked') {
  const freeTier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0 },
  });

  const tenant = await prisma.tenant.upsert({
    where: { id: TARGET_TID },
    update: { active: true, onboardingComplete: true },
    create: { id: TARGET_TID, name: 'Delete Target Tenant', active: true, onboardingComplete: true },
  });

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TARGET_TID, name: 'Company Admin' } },
    update: {},
    create: { tenantId: TARGET_TID, name: 'Company Admin', permissions: ['asset:read'], isSystem: true },
  });
  const hash = await bcrypt.hash(PASS, 4);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TARGET_TID, email: 'owner@del-target.test' } },
    update: {},
    create: { tenantId: TARGET_TID, email: 'owner@del-target.test', name: 'Owner', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {}, create: { userId: user.id, roleId: role.id },
  });

  await prisma.licence.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.licence.create({
    data: {
      tenantId: TARGET_TID,
      tierId: freeTier.id,
      licenceNumber: `VAI-DEL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: licenceStatus,
      activatedAt: new Date(),
      ...(licenceStatus === 'revoked' ? { revokedAt: new Date() } : {}),
    },
  });

  const site = await prisma.site.create({ data: { tenantId: TARGET_TID, name: `Del Site ${Date.now()}` } });
  await prisma.asset.create({
    data: { tenantId: TARGET_TID, assetNumber: `DEL-${Date.now()}`, name: 'Doomed Asset', siteId: site.id },
  });

  return tenant;
}

async function purgeTargetIfPresent() {
  const exists = await prisma.tenant.findUnique({ where: { id: TARGET_TID } });
  if (!exists) return;
  await prisma.asset.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.site.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.licence.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TARGET_TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.role.deleteMany({ where: { tenantId: TARGET_TID } });
  await prisma.tenant.delete({ where: { id: TARGET_TID } });
}

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: PLATFORM_TID },
    update: { onboardingComplete: true },
    create: { id: PLATFORM_TID, name: 'Platform Del Test Tenant', onboardingComplete: true },
  });
  const superRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: PLATFORM_TID, name: 'Platform Super Admin' } },
    update: {},
    create: { tenantId: PLATFORM_TID, name: 'Platform Super Admin', permissions: ['*'], isSystem: true },
  });
  const hash = await bcrypt.hash(PASS, 4);
  const superUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: PLATFORM_TID, email: 'super@del-test.vairiot.test' } },
    update: {},
    create: { tenantId: PLATFORM_TID, email: 'super@del-test.vairiot.test', name: 'Super', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superUser.id, roleId: superRole.id } },
    update: {}, create: { userId: superUser.id, roleId: superRole.id },
  });

  superToken = (await request(app).post('/api/v1/auth/login')
    .send({ email: 'super@del-test.vairiot.test', password: PASS, tenantId: PLATFORM_TID })).body.accessToken;
});

afterAll(async () => {
  await purgeTargetIfPresent();
  await prisma.auditEvent.deleteMany({ where: { tenantId: PLATFORM_TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: PLATFORM_TID } } });
  await prisma.user.deleteMany({ where: { tenantId: PLATFORM_TID } });
  await prisma.role.deleteMany({ where: { tenantId: PLATFORM_TID } });
  await prisma.tenant.deleteMany({ where: { id: PLATFORM_TID } });
  await prisma.$disconnect();
});

describe('DELETE /api/v1/admin/platform/tenants/:id', () => {
  afterEach(async () => {
    await purgeTargetIfPresent();
  });

  it('404s for an unknown tenant', async () => {
    const r = await request(app)
      .delete('/api/v1/admin/platform/tenants/does-not-exist')
      .set('Authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(404);
  });

  it('refuses to delete a tenant whose licence is not revoked', async () => {
    await createTargetTenant('active');
    const r = await request(app)
      .delete(`/api/v1/admin/platform/tenants/${TARGET_TID}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/revoked/i);
    expect(await prisma.tenant.findUnique({ where: { id: TARGET_TID } })).not.toBeNull();
  });

  it("refuses to delete the actor's own tenant", async () => {
    const r = await request(app)
      .delete(`/api/v1/admin/platform/tenants/${PLATFORM_TID}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/own/i);
  });

  it('deletes a revoked tenant and all of its data', async () => {
    await createTargetTenant('revoked');
    const r = await request(app)
      .delete(`/api/v1/admin/platform/tenants/${TARGET_TID}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(200);
    expect(r.body.deletedTenantId).toBe(TARGET_TID);

    expect(await prisma.tenant.findUnique({ where: { id: TARGET_TID } })).toBeNull();
    expect(await prisma.user.count({ where: { tenantId: TARGET_TID } })).toBe(0);
    expect(await prisma.asset.count({ where: { tenantId: TARGET_TID } })).toBe(0);
    expect(await prisma.licence.count({ where: { tenantId: TARGET_TID } })).toBe(0);
    expect(await prisma.site.count({ where: { tenantId: TARGET_TID } })).toBe(0);
    expect(await prisma.role.count({ where: { tenantId: TARGET_TID } })).toBe(0);
  });

  it('rejects non-platform-admin users', async () => {
    await createTargetTenant('revoked');
    const r = await request(app)
      .delete(`/api/v1/admin/platform/tenants/${TARGET_TID}`)
      .send();
    expect(r.status).toBe(401);
    expect(await prisma.tenant.findUnique({ where: { id: TARGET_TID } })).not.toBeNull();
  });
});
