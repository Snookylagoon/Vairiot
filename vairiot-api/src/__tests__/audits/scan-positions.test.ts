import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { positionEventType } from '../../services/asset-geo.service';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Scan positions and position events (Phase 1 W2, stage 1.5).

const app = createApp();
const TID = 'test-scan-positions-tenant';
const EMAIL = 'scanpos@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let siteId: string;
let zoneId: string;
let assetId: string;
const auth = () => ({ Authorization: `Bearer ${token}` });
const setFlags = (featureFlags: Record<string, boolean>) =>
  prisma.tenant.update({ where: { id: TID }, data: { featureFlags } });

async function startCampaign(body: Record<string, unknown>) {
  const c = await request(app).post('/api/v1/audits').set(auth()).send(body);
  expect(c.status).toBe(201);
  const s = await request(app).post(`/api/v1/audits/${c.body.id}/start`).set(auth());
  expect(s.status).toBe(200);
  return c.body.id as string;
}

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'Scan Positions', onboardingComplete: true } });
  await setFlags({ gis: true, blindAudit: true });
  const perms = ['asset:read', 'asset:write', 'audit:read', 'audit:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: perms }, create: { tenantId: TID, name: 'Administrator', permissions: perms } });
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Scan Tester', passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  await ensureTestLicence(TID);
  token = (await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID })).body.accessToken;
  siteId = (await prisma.site.create({ data: { tenantId: TID, name: 'Rustaveli Avenue' } })).id;
  zoneId = (await prisma.location.create({ data: { siteId, name: 'Block 1' } })).id;
  const a = await request(app).post('/api/v1/assets').set(auth())
    .send({ name: 'Street sign', siteId, locationId: zoneId, rfidTag: 'RFID-POS-001', latitude: 41.7, longitude: 44.8 });
  assetId = a.body.id;
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditSnapshotAsset.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditScanEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.location.deleteMany({ where: { site: { tenantId: TID } } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('position events on the asset ledger', () => {
  const events = () => prisma.assetEvent.findMany({ where: { assetId }, orderBy: { seq: 'asc' } });

  it('records POSITION_CAPTURED when an asset is created with a position', async () => {
    const e = await events();
    expect(e.map((x) => x.eventType)).toEqual(['CREATED', 'POSITION_CAPTURED']);
    expect(e[1].payload).toMatchObject({ latitude: 41.7, longitude: 44.8 });
  });

  it('ignores a sub-metre move and records a real one as POSITION_CORRECTED', async () => {
    await request(app).patch(`/api/v1/assets/${assetId}`).set(auth()).send({ latitude: 41.700003, longitude: 44.8 });
    expect((await events()).filter((x) => x.eventType === 'POSITION_CORRECTED')).toHaveLength(0);
    await request(app).patch(`/api/v1/assets/${assetId}`).set(auth()).send({ latitude: 41.701, longitude: 44.8 });
    const corrected = (await events()).filter((x) => x.eventType === 'POSITION_CORRECTED');
    expect(corrected).toHaveLength(1);
    expect(corrected[0].payload).toMatchObject({ latitude: 41.701, previous: { latitude: 41.700003 } });
  });

  it('classifies changes', () => {
    expect(positionEventType(null, { latitude: 1, longitude: 2 })).toBe('POSITION_CAPTURED');
    expect(positionEventType({ latitude: 1, longitude: 2 }, { latitude: null, longitude: null })).toBeNull();
    expect(positionEventType({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 })).toBeNull();
  });
});

describe('scan positions', () => {
  let campaignId: string;

  beforeAll(async () => {
    campaignId = await startCampaign({ name: 'Sighted with GPS', siteId });
  });

  it('stores the device position with a scan', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth())
      .send({ tagValue: 'RFID-POS-001', latitude: 41.7012, longitude: 44.8004, geoAccuracyMeters: 7.84 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ latitude: 41.7012, longitude: 44.8004, geoAccuracyMeters: 7.8, geoSource: 'device' });
  });

  it('keeps a scan whose position is unusable, without the position', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth())
      .send({ tagValue: 'RFID-UNKNOWN-1', latitude: 95, longitude: 44.8 });
    expect(r.status).toBe(201);
    expect(r.body.latitude).toBeNull();
  });

  it('lists positioned scans as GeoJSON', async () => {
    const r = await request(app).get(`/api/v1/audits/${campaignId}/scans/geo`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.features).toHaveLength(1);
    expect(r.body.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [44.8004, 41.7012] },
      properties: { tagValue: 'RFID-POS-001', result: 'found', assetId },
    });
  });

  it('ignores positions and hides the endpoint while GIS is off', async () => {
    await setFlags({ blindAudit: true });
    const r = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth())
      .send({ tagValue: 'RFID-POS-001', latitude: 41.7, longitude: 44.8 });
    expect(r.status).toBe(201);
    expect(r.body.latitude).toBeNull();
    expect((await request(app).get(`/api/v1/audits/${campaignId}/scans/geo`).set(auth())).status).toBe(404);
    await setFlags({ gis: true, blindAudit: true });
  });
});

describe('blind campaigns', () => {
  it('snapshots the register position and hides scan results until completed', async () => {
    const campaignId = await startCampaign({ name: 'Blind with GPS', mode: 'blind', siteId });
    const snap = await prisma.auditSnapshotAsset.findFirst({ where: { campaignId, assetId } });
    expect(snap).toMatchObject({ latitude: 41.701, longitude: 44.8 });

    await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth())
      .send({ tagValue: 'RFID-POS-001', locationId: zoneId, latitude: 41.7011, longitude: 44.8001 });
    const geo = await request(app).get(`/api/v1/audits/${campaignId}/scans/geo`).set(auth());
    expect(geo.body.features[0].properties).toMatchObject({ result: 'recorded', assetId: null });
  });
});
