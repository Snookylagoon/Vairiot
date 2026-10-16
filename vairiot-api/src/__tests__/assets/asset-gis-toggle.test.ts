import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

// GIS behind the tenant's `gis` flag (decision D7, stage 0.9): switched off,
// the map is a 404 and positions sent are ignored; switched back on, stored
// positions are still there.

const app = createApp();
const TID = 'test-gis-toggle-tenant-001';
const EMAIL = 'gistoggle@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let assetId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });
const setGis = (gis: boolean) =>
  prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { gis } } });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: {} }, create: { id: TID, name: 'GIS Toggle Tenant', onboardingComplete: true } });
  const perms = ['asset:read', 'asset:write', 'asset:delete'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: perms }, create: { tenantId: TID, name: 'Administrator', permissions: perms } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'GIS Toggle Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, isPerpetual: true },
  });
  await prisma.licence.upsert({
    where: { id: `test-licence-${TID}` },
    update: { status: 'active' },
    create: { id: `test-licence-${TID}`, tenantId: TID, tierId: tier.id, licenceNumber: `VAI-TEST-${TID}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('GIS switched off (default)', () => {
  it('answers 404 for the asset map', async () => {
    const r = await request(app).get('/api/v1/assets/map').set(auth());
    expect(r.status).toBe(404);
  });

  it('saves an asset but ignores the position sent with it', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth())
      .send({ name: 'Unmapped Pump', latitude: 41.7151, longitude: 44.8271, geoSource: 'device' });
    expect(r.status).toBe(201);
    expect(r.body.latitude).toBeNull();
    assetId = r.body.id;
  });

  it('does not refuse an invalid position it is going to ignore', async () => {
    const r = await request(app).patch(`/api/v1/assets/${assetId}`).set(auth()).send({ latitude: 91 });
    expect(r.status).toBe(200);
  });
});

describe('GIS switched on, then off again', () => {
  it('stores a position and lists it on the map', async () => {
    await setGis(true);
    const patch = await request(app).patch(`/api/v1/assets/${assetId}`).set(auth()).send({ latitude: 41.72, longitude: 44.83 });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ latitude: 41.72, longitude: 44.83 });
    const map = await request(app).get('/api/v1/assets/map').set(auth());
    expect(map.status).toBe(200);
  });

  it('keeps the stored position while switched off', async () => {
    await setGis(false);
    expect((await request(app).get('/api/v1/assets/map').set(auth())).status).toBe(404);
    const clear = await request(app).patch(`/api/v1/assets/${assetId}`).set(auth()).send({ latitude: null, longitude: null });
    expect(clear.status).toBe(200);
    await setGis(true);
    const r = await request(app).get(`/api/v1/assets/${assetId}`).set(auth());
    expect(r.body).toMatchObject({ latitude: 41.72, longitude: 44.83 });
  });
});
