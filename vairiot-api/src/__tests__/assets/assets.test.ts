import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

const app = createApp();
const TID = 'test-asset-tenant-001';
const EMAIL = 'assettest@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let categoryId: string;
let siteId: string;
let assetId: string;

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'Asset Test Tenant', onboardingComplete: true } });
  const ADMIN_PERMS = ['asset:read', 'asset:write', 'asset:delete', 'site:write', 'category:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: ADMIN_PERMS }, create: { tenantId: TID, name: 'Administrator', permissions: ADMIN_PERMS } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Asset Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  // Seed a FREE licence tier and activate a licence for the test tenant
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
  await flushAuditEvents(); // let in-flight audit writes land before deleting the tenant
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.category.deleteMany({ where: { tenantId: TID } });
  await prisma.location.deleteMany({ where: { site: { tenantId: TID } } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Categories', () => {
  it('creates a category', async () => {
    const r = await request(app).post('/api/v1/categories').set('Authorization', `Bearer ${token}`).send({ name: 'IT Equipment' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('IT Equipment');
    categoryId = r.body.id;
  });
  it('lists categories', async () => {
    const r = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

describe('Sites', () => {
  it('creates a site', async () => {
    const r = await request(app).post('/api/v1/sites').set('Authorization', `Bearer ${token}`).send({ name: 'Head Office', city: 'London', country: 'UK' });
    expect(r.status).toBe(201);
    siteId = r.body.id;
  });
  it('creates a location within a site', async () => {
    const r = await request(app).post(`/api/v1/sites/${siteId}/locations`).set('Authorization', `Bearer ${token}`).send({ name: 'Server Room', type: 'room' });
    expect(r.status).toBe(201);
  });
});

describe('Assets', () => {
  const extraAssetIds: string[] = [];

  it('creates an asset', async () => {
    const r = await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dell Laptop XPS 15', categoryId, siteId, serialNumber: 'SN-123456', barcode: 'BC-001' });
    expect(r.status).toBe(201);
    expect(r.body.assetNumber).toMatch(/^AST-/);
    assetId = r.body.id;
  });

  it('replaying a create with the same clientRequestId returns the existing asset', async () => {
    const payload = { name: 'Offline Queued Scanner', clientRequestId: 'test-client-req-001' };
    const first = await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`).send(payload);
    expect(first.status).toBe(201);
    const replay = await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`).send(payload);
    expect(replay.status).toBe(200); // replay: the original asset, not a new one
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.assetNumber).toBe(first.body.assetNumber);
    extraAssetIds.push(first.body.id);
  });

  it('creates additional assets for filter/sort tests', async () => {
    const assets = [
      { name: 'Apple MacBook Pro', condition: 'good', status: 'active', barcode: 'BC-002' },
      { name: 'Cisco Switch 9300', condition: 'fair', status: 'maintenance', barcode: 'BC-003' },
      { name: 'Zebra Scanner TC52', condition: 'poor', status: 'inactive', barcode: 'BC-004' },
    ];
    for (const a of assets) {
      const r = await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`)
        .send({ ...a, categoryId, siteId });
      expect(r.status).toBe(201);
      extraAssetIds.push(r.body.id);
    }
  });

  it('lists assets', async () => {
    const r = await request(app).get('/api/v1/assets').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThanOrEqual(4);
  });

  it('gets asset by id', async () => {
    const r = await request(app).get(`/api/v1/assets/${assetId}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Dell Laptop XPS 15');
  });

  it('searches assets by name', async () => {
    const r = await request(app).get('/api/v1/assets?search=Dell').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBeGreaterThan(0);
    expect(r.body.assets[0].name).toContain('Dell');
  });

  it('sorts assets by name ascending', async () => {
    const r = await request(app).get('/api/v1/assets?sortBy=name&sortOrder=asc').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const names = r.body.assets.map((a: { name: string }) => a.name);
    expect(names).toEqual([...names].sort());
  });

  it('sorts assets by name descending', async () => {
    const r = await request(app).get('/api/v1/assets?sortBy=name&sortOrder=desc').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const names = r.body.assets.map((a: { name: string }) => a.name);
    expect(names).toEqual([...names].sort().reverse());
  });

  it('ignores invalid sortBy column', async () => {
    const r = await request(app).get('/api/v1/assets?sortBy=dropTable&sortOrder=asc').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    const r = await request(app).get('/api/v1/assets?status=maintenance').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBe(1);
    expect(r.body.assets[0].status).toBe('maintenance');
  });

  it('filters by condition', async () => {
    const r = await request(app).get('/api/v1/assets?condition=poor').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBe(1);
    expect(r.body.assets[0].condition).toBe('poor');
  });

  it('combines search + status filter', async () => {
    const r = await request(app).get('/api/v1/assets?search=Cisco&status=maintenance').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBe(1);
    expect(r.body.assets[0].name).toContain('Cisco');
  });

  it('returns empty for non-matching combined filters', async () => {
    const r = await request(app).get('/api/v1/assets?search=Dell&status=maintenance').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBe(0);
  });

  it('paginates results', async () => {
    const r = await request(app).get('/api/v1/assets?page=1&pageSize=2').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBe(2);
    expect(r.body.page).toBe(1);
    expect(r.body.pageSize).toBe(2);
    expect(r.body.totalPages).toBeGreaterThanOrEqual(2);
    expect(r.body.total).toBeGreaterThanOrEqual(4);
  });

  it('returns correct second page', async () => {
    const r = await request(app).get('/api/v1/assets?page=2&pageSize=2').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBeGreaterThan(0);
    expect(r.body.page).toBe(2);
  });

  it('exports CSV with filters applied', async () => {
    const r = await request(app).get('/api/v1/assets/export.csv?status=maintenance').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    const lines = r.text.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 maintenance asset
  });

  it('exports full CSV without filters', async () => {
    const r = await request(app).get('/api/v1/assets/export.csv').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const lines = r.text.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(5); // header + 4+ assets
  });

  it('finds asset by barcode tag', async () => {
    const r = await request(app).get('/api/v1/assets/tag/BC-001').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(assetId);
  });

  it('updates an asset', async () => {
    const r = await request(app).patch(`/api/v1/assets/${assetId}`).set('Authorization', `Bearer ${token}`).send({ condition: 'excellent' });
    expect(r.status).toBe(200);
    expect(r.body.condition).toBe('excellent');
  });

  it('returns 404 for unknown asset', async () => {
    const r = await request(app).get('/api/v1/assets/nonexistent-id').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(404);
  });

  it('returns stats grouped by status and condition', async () => {
    const r = await request(app).get('/api/v1/assets/stats').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('total');
    expect(r.body).toHaveProperty('byStatus');
    expect(r.body).toHaveProperty('byCondition');
    expect(typeof r.body.byStatus).toBe('object');
  });

  it('deletes assets', async () => {
    for (const id of [assetId, ...extraAssetIds]) {
      const r = await request(app).delete(`/api/v1/assets/${id}`).set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(204);
    }
  });
});

describe('Asset GIS position', () => {
  let geoAssetId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { gis: true } } });
  });

  it('creates an asset with a position alongside its site', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth()).send({
      name: 'Rooftop Antenna', siteId, latitude: 41.7151, longitude: 44.8271,
      geoAccuracyMeters: 6, geoSource: 'device',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ latitude: 41.7151, longitude: 44.8271, geoAccuracyMeters: 6, geoSource: 'device' });
    expect(r.body.site.id).toBe(siteId);
    expect(r.body.geoCapturedAt).toBeTruthy();
    geoAssetId = r.body.id;
  });

  it('creates an asset without a position', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth()).send({ name: 'Unplaced Chair' });
    expect(r.status).toBe(201);
    expect(r.body.latitude).toBeNull();
    expect(r.body.longitude).toBeNull();
  });

  it('rejects an out-of-range or half-supplied position', async () => {
    const bad = await request(app).post('/api/v1/assets').set(auth()).send({ name: 'Bad', latitude: 91, longitude: 0 });
    expect(bad.status).toBe(400);
    const half = await request(app).patch(`/api/v1/assets/${geoAssetId}`).set(auth()).send({ latitude: 10.5 });
    expect(half.status).toBe(400);
  });

  it('keeps capture metadata when a form re-sends the same position', async () => {
    const r = await request(app).patch(`/api/v1/assets/${geoAssetId}`).set(auth())
      .send({ name: 'Rooftop Antenna (North)', latitude: '41.7151', longitude: '44.8271' });
    expect(r.status).toBe(200);
    expect(r.body.geoSource).toBe('device');
    expect(r.body.geoAccuracyMeters).toBe(6);
  });

  it('moves the asset', async () => {
    const r = await request(app).patch(`/api/v1/assets/${geoAssetId}`).set(auth()).send({ latitude: 41.72, longitude: 44.83 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ latitude: 41.72, longitude: 44.83, geoSource: 'manual', geoAccuracyMeters: null });
  });

  it('exports the position in the CSV', async () => {
    const r = await request(app).get('/api/v1/assets/export.csv?search=Rooftop').set(auth());
    expect(r.status).toBe(200);
    const [header, row] = r.text.trim().split('\n');
    expect(header).toContain('Latitude,Longitude');
    expect(row).toContain('41.72,44.83');
  });

  it('imports positions, rejecting bad rows', async () => {
    const r = await request(app).post('/api/v1/assets/import').set(auth()).send({ rows: [
      { name: 'Imported Pump', latitude: '41.70', longitude: '44.80' },
      { name: 'Imported Valve', latitude: '41.70' },
    ] });
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(1);
    expect(r.body.errors).toEqual([{ row: 2, message: 'Latitude and longitude must be provided together' }]);
    const pump = await prisma.asset.findFirst({ where: { tenantId: TID, name: 'Imported Pump' } });
    expect(pump).toMatchObject({ latitude: 41.7, longitude: 44.8, geoSource: 'import' });
  });

  it('lists positioned assets for the map, with the list filters', async () => {
    const r = await request(app).get('/api/v1/assets/map').set(auth());
    expect(r.status).toBe(200);
    const names = r.body.assets.map((a: { name: string }) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Rooftop Antenna (North)', 'Imported Pump']));
    expect(names).not.toContain('Unplaced Chair');
    expect(r.body.unplaced).toBeGreaterThanOrEqual(1);
    expect(r.body.truncated).toBe(false);
    const antenna = r.body.assets.find((a: { name: string }) => a.name === 'Rooftop Antenna (North)');
    expect(antenna).toMatchObject({ latitude: 41.72, longitude: 44.83, site: { id: siteId } });
    expect(antenna).not.toHaveProperty('purchaseCost');

    const bySite = await request(app).get(`/api/v1/assets/map?siteId=${siteId}`).set(auth());
    expect(bySite.body.assets.map((a: { name: string }) => a.name)).toEqual(['Rooftop Antenna (North)']);
    const bySearch = await request(app).get('/api/v1/assets/map?search=pump').set(auth());
    expect(bySearch.body.assets.map((a: { name: string }) => a.name)).toEqual(['Imported Pump']);
  });

  it('clears the position', async () => {
    const r = await request(app).patch(`/api/v1/assets/${geoAssetId}`).set(auth()).send({ latitude: null, longitude: null });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ latitude: null, longitude: null, geoSource: null, geoCapturedAt: null });
  });
});
