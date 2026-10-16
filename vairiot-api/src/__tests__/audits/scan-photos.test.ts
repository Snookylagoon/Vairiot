import { Readable } from 'stream';

import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { readJpegExifFacts } from '../../lib/image-metadata/exif-read';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';
import { jpegWithExif } from '../photos/exif-fixtures';

// Photos bound to audit scans (Phase 1 W3, stage 1.7). The test stack has no
// MinIO, so an in-memory store stands in for it.
const store = new Map<string, Buffer>();
jest.mock('../../lib/minio', () => ({
  PHOTO_BUCKET: 'photos',
  DOCUMENT_BUCKET: 'documents',
  MOBILE_RELEASES_BUCKET: 'releases',
  minioClient: {
    putObject: async (bucket: string, key: string, body: Buffer) => { store.set(`${bucket}/${key}`, Buffer.from(body)); },
    getObject: async (bucket: string, key: string) => {
      const body = store.get(`${bucket}/${key}`);
      if (!body) throw new Error('NoSuchKey');
      return Readable.from([body]);
    },
    removeObject: async (bucket: string, key: string) => { store.delete(`${bucket}/${key}`); },
  },
}));

const app = createApp();
const TID = 'test-scan-photos-tenant';
const EMAIL = 'scanphotos@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let siteId: string;
let zoneA: string;
let zoneB: string;
let assetId: string;
const auth = () => ({ Authorization: `Bearer ${token}` });
const EXIF_JPEG = jpegWithExif({ latitude: 41.6934, longitude: 44.8015, accuracyMeters: 5, gpsDate: '2026:10:16', gpsTime: '08:30:15' });

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function startCampaign(body: Record<string, unknown>) {
  const c = await request(app).post('/api/v1/audits').set(auth()).send(body);
  await request(app).post(`/api/v1/audits/${c.body.id}/start`).set(auth());
  return c.body.id as string;
}

const upload = (campaignId: string, scanRef: string, fields: Record<string, string> = {}, file = EXIF_JPEG) => {
  let r = request(app).post(`/api/v1/audits/${campaignId}/scans/${scanRef}/photos`).set(auth())
    .attach('photo', file, { filename: 'scan.jpg', contentType: 'image/jpeg' });
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { gis: true, blindAudit: true } }, create: { id: TID, name: 'Scan Photos', onboardingComplete: true, featureFlags: { gis: true, blindAudit: true } } });
  const perms = ['asset:read', 'asset:write', 'audit:read', 'audit:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: perms }, create: { tenantId: TID, name: 'Administrator', permissions: perms } });
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Photo Tester', passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  await ensureTestLicence(TID);
  token = (await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID })).body.accessToken;
  siteId = (await prisma.site.create({ data: { tenantId: TID, name: 'Freedom Square' } })).id;
  zoneA = (await prisma.location.create({ data: { siteId, name: 'Zone A' } })).id;
  zoneB = (await prisma.location.create({ data: { siteId, name: 'Zone B' } })).id;
  assetId = (await request(app).post('/api/v1/assets').set(auth()).send({ name: 'Bus shelter', siteId, rfidTag: 'RFID-PHOTO-1' })).body.id;
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.photo.deleteMany({ where: { tenantId: TID } });
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

describe('sighted campaign scan photos', () => {
  let campaignId: string;
  let scanId: string;

  beforeAll(async () => {
    campaignId = await startCampaign({ name: 'Photo audit', siteId });
    const scan = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth())
      .send({ tagValue: 'RFID-PHOTO-1', clientRequestId: 'device-key-1', latitude: 41.7, longitude: 44.8 });
    scanId = scan.body.id;
  });

  it('accepts a photo addressed by the device’s clientRequestId, with EXIF time and position', async () => {
    const r = await upload(campaignId, 'device-key-1');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ scanEventId: scanId, assetId, photoType: 'inventory', geoAccuracyMeters: 5 });
    expect(r.body.latitude).toBeCloseTo(41.6934, 4);
    expect(r.body.capturedAt).toBe('2026-10-16T08:30:15.000Z');
  });

  it('prefers the position and time the device sent', async () => {
    const r = await upload(campaignId, scanId, { latitude: '41.71', longitude: '44.81', capturedAt: '2026-10-16T09:00:00Z', photoType: 'condition' });
    expect(r.body).toMatchObject({ latitude: 41.71, longitude: 44.81, capturedAt: '2026-10-16T09:00:00.000Z', photoType: 'condition' });
  });

  it('falls back to the scan’s own position when the photo has none', async () => {
    const r = await upload(campaignId, scanId, {}, Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]));
    expect(r.body).toMatchObject({ latitude: 41.7, longitude: 44.8 });
  });

  it('caps photos per scan and refuses unknown scans and types', async () => {
    expect((await upload(campaignId, scanId)).status).toBe(201);
    expect((await upload(campaignId, scanId)).status).toBe(400);
    expect((await upload(campaignId, 'no-such-scan')).status).toBe(404);
    const other = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send({ tagValue: 'RFID-UNKNOWN-9' });
    expect((await upload(campaignId, other.body.id, { photoType: 'selfie' })).status).toBe(400);
  });

  it('keeps a photo of an unknown tag without an asset', async () => {
    const other = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send({ tagValue: 'RFID-UNKNOWN-10' });
    const r = await upload(campaignId, other.body.id);
    expect(r.status).toBe(201);
    expect(r.body.assetId).toBeNull();
  });

  it('downloads without the EXIF position (KFR-043)', async () => {
    const list = await request(app).get(`/api/v1/audits/${campaignId}/photos`).set(auth());
    const first = list.body[0];
    const dl = await request(app).get(`/api/v1/photos/${first.id}/download`).set(auth()).buffer(true).parse(binary);
    expect(dl.status).toBe(200);
    expect(readJpegExifFacts(dl.body as Buffer)).toEqual({});
  });
});

describe('listing and blind campaigns', () => {
  it('lists a zone’s photos and hides matches until a blind campaign completes', async () => {
    const campaignId = await startCampaign({ name: 'Blind photo audit', mode: 'blind', siteId });
    const a = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send({ tagValue: 'RFID-PHOTO-1', locationId: zoneA });
    const b = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send({ tagValue: 'RFID-OTHER', locationId: zoneB });
    await upload(campaignId, a.body.id);
    await upload(campaignId, b.body.id);

    const zone = await request(app).get(`/api/v1/audits/${campaignId}/photos?locationId=${zoneA}`).set(auth());
    expect(zone.status).toBe(200);
    expect(zone.body).toHaveLength(1);
    expect(zone.body[0]).toMatchObject({ tagValue: 'RFID-PHOTO-1', locationId: zoneA, assetId: null, result: 'recorded' });
  });

  it('stores no position while GIS is off', async () => {
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { blindAudit: true } } });
    const campaignId = await startCampaign({ name: 'No GIS', siteId });
    const s = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send({ tagValue: 'RFID-PHOTO-1' });
    const r = await upload(campaignId, s.body.id);
    expect(r.body.latitude).toBeNull();
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { gis: true, blindAudit: true } } });
  });
});
