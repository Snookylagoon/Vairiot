import request from 'supertest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../app';
import { ROLE_PERMISSION_MATRIX } from 'vairiot-shared';

const prisma = new PrismaClient();
const app    = createApp();

const TID  = 'test-rbac';
const PASS = 'TestPassword1!';

let tokens: Record<string, string> = {};

beforeAll(async () => {
  const hash = await bcrypt.hash(PASS, 4);

  await prisma.tenant.upsert({
    where: { id: TID },
    update: { name: 'RBAC Test', active: true, onboardingComplete: true },
    create: { id: TID, name: 'RBAC Test', slug: 'rbac-test', active: true, onboardingComplete: true },
  });

  // Seed licence tier + active licence
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, pricePerDevice: 10, isPerpetual: true },
  });
  const existingLicence = await prisma.licence.findFirst({ where: { tenantId: TID, status: 'active' } });
  if (!existingLicence) {
    await prisma.licence.create({
      data: { tenantId: TID, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
    });
  }

  // Create roles from matrix and one user per role
  for (const def of ROLE_PERMISSION_MATRIX) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: TID, name: def.name } },
      update: { permissions: [...def.permissions], isSystem: true },
      create: { tenantId: TID, name: def.name, permissions: [...def.permissions], isSystem: true },
    });

    const email = `${def.name.toLowerCase().replace(/ /g, '-')}@rbac.test`;
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TID, email } },
      update: { passwordHash: hash, active: true },
      create: { tenantId: TID, email, name: def.name, passwordHash: hash, active: true },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    const res = await request(app).post('/api/v1/auth/login')
      .send({ email, password: PASS, tenantId: TID });
    tokens[def.name] = res.body.accessToken;
  }
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.loginAttempt.deleteMany({ where: { email: { contains: '@rbac.test' } } });
  await prisma.onboardingProgress.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('RBAC — Role enforcement', () => {
  it('Company Admin can list users (user:read)', async () => {
    const res = await request(app).get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens['Company Admin']}`);
    expect(res.status).toBe(200);
  });

  it('Viewer cannot list users (no user:read)', async () => {
    const res = await request(app).get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens['Viewer']}`);
    expect(res.status).toBe(403);
  });

  it('Asset Manager can list assets (asset:read)', async () => {
    const res = await request(app).get('/api/v1/assets')
      .set('Authorization', `Bearer ${tokens['Asset Manager']}`);
    expect(res.status).toBe(200);
  });

  it('Viewer can list assets (asset:read)', async () => {
    const res = await request(app).get('/api/v1/assets')
      .set('Authorization', `Bearer ${tokens['Viewer']}`);
    expect(res.status).toBe(200);
  });

  it('Data Collector cannot create assets (no asset:write)', async () => {
    const res = await request(app).post('/api/v1/assets')
      .set('Authorization', `Bearer ${tokens['Data Collector']}`)
      .send({ assetNumber: 'X-9999', name: 'Test', status: 'active', condition: 'good' });
    expect(res.status).toBe(403);
  });

  it('Licensing Authority can access licence routes', async () => {
    const res = await request(app).get('/api/v1/licences/all')
      .set('Authorization', `Bearer ${tokens['Licensing Authority']}`);
    expect(res.status).toBe(200);
  });

  it('Viewer cannot access licence authority routes', async () => {
    const res = await request(app).get('/api/v1/licences/all')
      .set('Authorization', `Bearer ${tokens['Viewer']}`);
    expect(res.status).toBe(403);
  });

  it('all 11 roles have tokens', () => {
    expect(Object.keys(tokens)).toHaveLength(ROLE_PERMISSION_MATRIX.length);
  });

  it('each role has the expected permissions from the matrix', async () => {
    for (const def of ROLE_PERMISSION_MATRIX) {
      const res = await request(app).get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokens[def.name]}`);
      expect(res.status).toBe(200);
      for (const perm of def.permissions) {
        expect(res.body.permissions).toContain(perm);
      }
    }
  });
});
