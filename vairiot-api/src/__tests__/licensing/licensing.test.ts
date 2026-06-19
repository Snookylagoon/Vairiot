import request from 'supertest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../app';

const prisma = new PrismaClient();
const app    = createApp();

const TID  = 'test-licensing';
const PASS = 'TestPassword1!';

let adminToken: string;
let authorityToken: string;
let viewerToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASS, 4);

  await prisma.tenant.upsert({
    where: { id: TID },
    update: { name: 'Licensing Test', active: true, onboardingComplete: true },
    create: { id: TID, name: 'Licensing Test', slug: 'lic-test', active: true, onboardingComplete: true },
  });

  // Seed all three tiers
  for (const [name, config] of [
    ['FREE',   { displayName: 'Free',       maxAssets: 500,        baseDevices: 1, pricePerYear: 0,   pricePerDevice: 10, isPerpetual: true }],
    ['TIER_2', { displayName: 'Professional', maxAssets: 1500,     baseDevices: 1, pricePerYear: 50,  pricePerDevice: 10, isPerpetual: false }],
    ['TIER_3', { displayName: 'Enterprise',   maxAssets: 2147483647, baseDevices: 1, pricePerYear: 100, pricePerDevice: 10, isPerpetual: false }],
  ] as const) {
    await prisma.licenceTier.upsert({
      where: { name },
      update: {},
      create: { name, ...(config as any) },
    });
  }

  // Admin user
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Company Admin' } },
    update: { permissions: ['asset:read', 'asset:write', 'asset:delete', 'user:read', 'user:write'], isSystem: true },
    create: { tenantId: TID, name: 'Company Admin', permissions: ['asset:read', 'asset:write', 'asset:delete', 'user:read', 'user:write'], isSystem: true },
  });
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'admin@lic.test' } },
    update: { passwordHash: hash },
    create: { tenantId: TID, email: 'admin@lic.test', name: 'Admin', passwordHash: hash, active: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // Licensing Authority user
  const authRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Licensing Authority' } },
    update: { permissions: ['licence:manage', 'user:read', 'report:read'], isSystem: true },
    create: { tenantId: TID, name: 'Licensing Authority', permissions: ['licence:manage', 'user:read', 'report:read'], isSystem: true },
  });
  const authority = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'authority@lic.test' } },
    update: { passwordHash: hash },
    create: { tenantId: TID, email: 'authority@lic.test', name: 'Authority', passwordHash: hash, active: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: authority.id, roleId: authRole.id } },
    update: {},
    create: { userId: authority.id, roleId: authRole.id },
  });

  // Viewer user
  const viewerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Viewer' } },
    update: { permissions: ['asset:read', 'site:read', 'category:read', 'report:read'], isSystem: true },
    create: { tenantId: TID, name: 'Viewer', permissions: ['asset:read', 'site:read', 'category:read', 'report:read'], isSystem: true },
  });
  const viewer = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'viewer@lic.test' } },
    update: { passwordHash: hash },
    create: { tenantId: TID, email: 'viewer@lic.test', name: 'Viewer', passwordHash: hash, active: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: viewer.id, roleId: viewerRole.id } },
    update: {},
    create: { userId: viewer.id, roleId: viewerRole.id },
  });

  // Create an active FREE licence
  const freeTier = await prisma.licenceTier.findUniqueOrThrow({ where: { name: 'FREE' } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.licence.create({
    data: { tenantId: TID, tierId: freeTier.id, licenceNumber: `VAI-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
  });

  // Login
  adminToken     = (await request(app).post('/api/v1/auth/login').send({ email: 'admin@lic.test', password: PASS, tenantId: TID })).body.accessToken;
  authorityToken = (await request(app).post('/api/v1/auth/login').send({ email: 'authority@lic.test', password: PASS, tenantId: TID })).body.accessToken;
  viewerToken    = (await request(app).post('/api/v1/auth/login').send({ email: 'viewer@lic.test', password: PASS, tenantId: TID })).body.accessToken;
});

afterAll(async () => {
  await prisma.device.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Licence status', () => {
  it('any authenticated user can view licence status', async () => {
    const res = await request(app).get('/api/v1/licences/status')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tierName');
    expect(res.body.tierName).toBe('FREE');
    expect(res.body.status).toBe('active');
  });
});

describe('Asset cap enforcement', () => {
  it('allows creation within FREE tier limit', async () => {
    const res = await request(app).post('/api/v1/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assetNumber: 'CAP-001', name: 'Cap Test Asset', status: 'active', condition: 'good' });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { tenantId: TID } });
  });
});

describe('Licensing Authority actions', () => {
  it('authority can list all licences', async () => {
    const res = await request(app).get('/api/v1/licences/all')
      .set('Authorization', `Bearer ${authorityToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('authority can suspend a licence', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TID, status: 'active' } });
    const res = await request(app).post(`/api/v1/licences/${licence.id}/suspend`)
      .set('Authorization', `Bearer ${authorityToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it('authority can reactivate a suspended licence', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TID, status: 'suspended' } });
    const res = await request(app).post(`/api/v1/licences/${licence.id}/reactivate`)
      .set('Authorization', `Bearer ${authorityToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects renewal of perpetual (FREE) licence', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TID, status: 'active' } });
    const res = await request(app).post(`/api/v1/licences/${licence.id}/renew`)
      .set('Authorization', `Bearer ${authorityToken}`)
      .send({ durationMonths: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/perpetual/i);
  });

  it('authority can add a device slot', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TID, status: 'active' } });
    const res = await request(app).post(`/api/v1/licences/${licence.id}/device-slots`)
      .set('Authorization', `Bearer ${authorityToken}`);
    expect(res.status).toBe(201);
  });

  it('viewer cannot suspend a licence', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TID } });
    const res = await request(app).post(`/api/v1/licences/${licence.id}/suspend`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Device registration', () => {
  it('admin can register a device', async () => {
    const res = await request(app).post('/api/v1/licences/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceName: 'Test Scanner', deviceType: 'handheld', fingerprint: 'fp-12345678' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('deviceId');
  });

  it('can list devices', async () => {
    const res = await request(app).get('/api/v1/licences/devices')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
