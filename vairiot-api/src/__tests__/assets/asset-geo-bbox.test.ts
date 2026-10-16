import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { parseBbox, parseGeoLimit } from '../../services/asset-geo-query.service';
import { flushAuditEvents } from '../../services/audit-event.service';

// PostGIS foundation (Phase 1 W1, stage 1.4): the geom column follows
// latitude/longitude through a trigger, and GET /assets/geo returns only the
// caller's in-box assets, behind the gis flag.

const app = createApp();
const TIDS = ['test-geo-bbox-tenant-a', 'test-geo-bbox-tenant-b'];
const PASS = 'TestPassword123!';
const tokens: Record<string, string> = {};
const TBILISI = '44.7,41.6,44.9,41.8';

const auth = (tid: string) => ({ Authorization: `Bearer ${tokens[tid]}` });

async function seedTenant(tid: string) {
  await prisma.tenant.upsert({ where: { id: tid }, update: { onboardingComplete: true, featureFlags: { gis: true } }, create: { id: tid, name: tid, onboardingComplete: true, featureFlags: { gis: true } } });
  const perms = ['asset:read', 'asset:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tid, name: 'Administrator' } }, update: { permissions: perms }, create: { tenantId: tid, name: 'Administrator', permissions: perms } });
  const email = `${tid}@vairiot.test`;
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: tid, email } }, update: {}, create: { tenantId: tid, email, name: tid, passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const tier = await prisma.licenceTier.upsert({ where: { name: 'FREE' }, update: {}, create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, isPerpetual: true } });
  await prisma.licence.upsert({ where: { id: `test-licence-${tid}` }, update: { status: 'active' }, create: { id: `test-licence-${tid}`, tenantId: tid, tierId: tier.id, licenceNumber: `VAI-TEST-${tid}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true } });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASS, tenantId: tid });
  tokens[tid] = login.body.accessToken;
}

async function createAsset(tid: string, name: string, lat?: number, lon?: number) {
  const r = await request(app).post('/api/v1/assets').set(auth(tid)).send({ name, latitude: lat, longitude: lon });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

const geomOf = async (id: string) => {
  const rows = await prisma.$queryRaw<{ lon: number | null; lat: number | null }[]>`
    SELECT ST_X("geom"::geometry) AS lon, ST_Y("geom"::geometry) AS lat FROM "assets" WHERE "id" = ${id}`;
  return rows[0];
};

let inBox: string;
let outOfBox: string;

beforeAll(async () => {
  for (const tid of TIDS) await seedTenant(tid);
  inBox = await createAsset(TIDS[0], 'Freedom Square sign', 41.6934, 44.8015);
  outOfBox = await createAsset(TIDS[0], 'Batumi sign', 41.6168, 41.6367);
  await createAsset(TIDS[0], 'Unplaced sign');
  await createAsset(TIDS[1], 'Other tenant sign', 41.7, 44.8);
});

afterAll(async () => {
  await flushAuditEvents();
  for (const tid of TIDS) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: tid } });
    await prisma.asset.deleteMany({ where: { tenantId: tid } });
    await prisma.licence.deleteMany({ where: { tenantId: tid } });
    await prisma.userRole.deleteMany({ where: { user: { tenantId: tid } } });
    await prisma.user.deleteMany({ where: { tenantId: tid } });
    await prisma.role.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

describe('geom trigger', () => {
  it('derives geom from latitude and longitude on insert', async () => {
    expect(await geomOf(inBox)).toEqual({ lon: 44.8015, lat: 41.6934 });
  });

  it('follows a moved position and clears with it', async () => {
    await request(app).patch(`/api/v1/assets/${outOfBox}`).set(auth(TIDS[0])).send({ latitude: 41.6, longitude: 41.6 });
    expect(await geomOf(outOfBox)).toEqual({ lon: 41.6, lat: 41.6 });
    await request(app).patch(`/api/v1/assets/${outOfBox}`).set(auth(TIDS[0])).send({ latitude: null, longitude: null });
    expect(await geomOf(outOfBox)).toEqual({ lon: null, lat: null });
  });
});

describe('GET /assets/geo', () => {
  it('returns only the caller’s assets inside the box, as GeoJSON', async () => {
    const r = await request(app).get(`/api/v1/assets/geo?bbox=${TBILISI}`).set(auth(TIDS[0]));
    expect(r.status).toBe(200);
    expect(r.body.type).toBe('FeatureCollection');
    expect(r.body.truncated).toBe(false);
    expect(r.body.features).toHaveLength(1);
    expect(r.body.features[0]).toMatchObject({
      type: 'Feature',
      id: inBox,
      geometry: { type: 'Point', coordinates: [44.8015, 41.6934] },
      properties: { name: 'Freedom Square sign' },
    });
  });

  it('says when the limit cut the result short', async () => {
    await createAsset(TIDS[0], 'Rustaveli sign', 41.701, 44.79);
    const r = await request(app).get(`/api/v1/assets/geo?bbox=${TBILISI}&limit=1`).set(auth(TIDS[0]));
    expect(r.body.features).toHaveLength(1);
    expect(r.body.truncated).toBe(true);
  });

  it('refuses a malformed box', async () => {
    for (const bbox of ['', '1,2,3', '44.9,41.6,44.7,41.8', '200,0,201,1', 'a,b,c,d']) {
      const r = await request(app).get(`/api/v1/assets/geo?bbox=${bbox}`).set(auth(TIDS[0]));
      expect(r.status).toBe(400);
    }
  });

  it('answers 404 when GIS is switched off', async () => {
    await prisma.tenant.update({ where: { id: TIDS[1] }, data: { featureFlags: {} } });
    const r = await request(app).get(`/api/v1/assets/geo?bbox=${TBILISI}`).set(auth(TIDS[1]));
    expect(r.status).toBe(404);
  });

  it('is documented in the served OpenAPI spec', async () => {
    const r = await request(app).get('/api/openapi.json');
    expect(r.body.paths['/assets/geo']).toBeDefined();
    expect(r.body.paths['/assets/map']).toBeDefined();
  });
});

describe('parsers', () => {
  it('reads a box in minLon,minLat,maxLon,maxLat order', () => {
    expect(parseBbox(' 44.7, 41.6 ,44.9,41.8')).toEqual({ minLon: 44.7, minLat: 41.6, maxLon: 44.9, maxLat: 41.8 });
  });

  it('defaults and bounds the limit', () => {
    expect(parseGeoLimit(undefined)).toBe(1000);
    expect(() => parseGeoLimit('0')).toThrow();
    expect(() => parseGeoLimit('5001')).toThrow();
    expect(() => parseGeoLimit('2.5')).toThrow();
  });
});
