import { Readable } from 'stream';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DEFAULT_CONDITION_SCALE } from 'vairiot-shared';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Condition scale, grades, CONDITION_ASSESSED and photo rules (W5, stage 1.13).
const store = new Map<string, Buffer>();
jest.mock('../../lib/minio', () => ({
  PHOTO_BUCKET: 'photos', DOCUMENT_BUCKET: 'documents', MOBILE_RELEASES_BUCKET: 'releases',
  minioClient: {
    putObject: async (b: string, k: string, body: Buffer) => { store.set(`${b}/${k}`, Buffer.from(body)); },
    getObject: async (b: string, k: string) => Readable.from([store.get(`${b}/${k}`)!]),
    removeObject: async () => {},
  },
}));

const app = createApp();
const TID = 'test-condition-scale-tenant';
const PASS = 'TestPassword123!';
const tokens: Record<string, string> = {};
let categoryId: string;
let siteId: string;
let zoneId: string;
const as = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
const scale = (overrides: Partial<(typeof DEFAULT_CONDITION_SCALE)[number]> = {}) =>
  DEFAULT_CONDITION_SCALE.map((e) => ({ ...e, ...(e.grade === 3 ? overrides : {}) }));

async function user(role: string, perms: string[]) {
  const email = `${role.toLowerCase()}@condition.test`;
  const r = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: role } }, update: { permissions: perms }, create: { tenantId: TID, name: role, permissions: perms } });
  const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email } }, update: {}, create: { tenantId: TID, email, name: role, passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: r.id } }, update: {}, create: { userId: u.id, roleId: r.id } });
  tokens[role] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASS, tenantId: TID })).body.accessToken;
}

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { blindAudit: true } }, create: { id: TID, name: 'Condition', onboardingComplete: true, featureFlags: { blindAudit: true } } });
  await ensureTestLicence(TID);
  await user('Administrator', ['company:manage', 'asset:read', 'asset:write', 'audit:read', 'audit:write']);
  await user('Viewer', ['asset:read']);
  categoryId = (await prisma.category.create({ data: { tenantId: TID, name: 'Street furniture' } })).id;
  siteId = (await prisma.site.create({ data: { tenantId: TID, name: 'Old Town' } })).id;
  zoneId = (await prisma.location.create({ data: { siteId, name: 'Block 1' } })).id;
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.photo.deleteMany({ where: { tenantId: TID } });
  await prisma.auditZoneSubmission.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditSnapshotAsset.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditScanEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.conditionScaleEntry.deleteMany({ where: { tenantId: TID } });
  await prisma.photoRule.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.category.deleteMany({ where: { tenantId: TID } });
  await prisma.location.deleteMany({ where: { site: { tenantId: TID } } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('condition scale', () => {
  it('serves the default scale until one is set', async () => {
    const r = await request(app).get('/api/v1/condition/scale').set(as('Viewer'));
    expect(r.body).toEqual({ source: 'default', entries: DEFAULT_CONDITION_SCALE });
  });

  it('takes a tenant scale and a category override, which falls back when removed', async () => {
    const t = await request(app).put('/api/v1/condition/scale').set(as('Administrator')).send({ entries: scale({ label: 'Worn' }) });
    expect(t.status).toBe(200);
    expect(t.body.source).toBe('tenant');
    const c = await request(app).put('/api/v1/condition/scale').set(as('Administrator'))
      .send({ categoryId, entries: scale({ label: 'Faded paint', photoRequired: true }) });
    expect(c.body).toMatchObject({ source: 'category' });
    expect((await request(app).get(`/api/v1/condition/scale?categoryId=${categoryId}`).set(as('Viewer'))).body.entries[2].label).toBe('Faded paint');
    const removed = await request(app).put('/api/v1/condition/scale').set(as('Administrator')).send({ categoryId, entries: null });
    expect(removed.body.entries[2].label).toBe('Worn');
    await request(app).put('/api/v1/condition/scale').set(as('Administrator')).send({ categoryId, entries: scale({ label: 'Faded paint', photoRequired: true }) });
  });

  it('refuses a malformed scale and needs company:manage', async () => {
    const twice = scale().map((e) => ({ ...e, grade: 3 }));
    for (const entries of [scale().slice(0, 4), twice, scale({ colour: 'red' })]) {
      expect((await request(app).put('/api/v1/condition/scale').set(as('Administrator')).send({ entries })).status).toBe(400);
    }
    expect((await request(app).put('/api/v1/condition/scale').set(as('Viewer')).send({ entries: scale() })).status).toBe(403);
  });
});

describe('asset grades and CONDITION_ASSESSED', () => {
  let assetId: string;

  it('keeps the grade and the string in step on create', async () => {
    const byGrade = await request(app).post('/api/v1/assets').set(as('Administrator')).send({ name: 'Bench', conditionGrade: 2, categoryId, siteId, rfidTag: 'COND-1' });
    expect(byGrade.body).toMatchObject({ condition: 'poor', conditionGrade: 2 });
    assetId = byGrade.body.id;
    const byString = await request(app).post('/api/v1/assets').set(as('Administrator')).send({ name: 'Lamp', condition: 'fair' });
    expect(byString.body).toMatchObject({ condition: 'fair', conditionGrade: 3 });
    const neither = await request(app).post('/api/v1/assets').set(as('Administrator')).send({ name: 'Sign' });
    expect(neither.body).toMatchObject({ condition: 'good', conditionGrade: 4 });
  });

  it('records a grade change on the ledger, and only a change', async () => {
    await request(app).patch(`/api/v1/assets/${assetId}`).set(as('Administrator')).send({ conditionGrade: 4 });
    await request(app).patch(`/api/v1/assets/${assetId}`).set(as('Administrator')).send({ condition: 'good' });
    const events = await prisma.assetEvent.findMany({ where: { assetId, eventType: 'CONDITION_ASSESSED' }, orderBy: { seq: 'asc' } });
    expect(events.map((e) => e.payload)).toEqual([
      { fromGrade: null, toGrade: 2, fromCondition: null, toCondition: 'poor' },
      { fromGrade: 2, toGrade: 4, fromCondition: 'poor', toCondition: 'good' },
    ]);
  });

  it('refuses a grade outside 1–5', async () => {
    expect((await request(app).patch(`/api/v1/assets/${assetId}`).set(as('Administrator')).send({ conditionGrade: 7 })).status).toBe(400);
    expect((await request(app).post('/api/v1/assets').set(as('Administrator')).send({ name: 'X', conditionGrade: 0 })).status).toBe(400);
  });
});

describe('photo rules and warnings', () => {
  it('stores rules and warns, without blocking, when a zone is submitted short of photos', async () => {
    const rules = await request(app).put('/api/v1/condition/photo-rules').set(as('Administrator'))
      .send({ defaultMinPhotos: 0, categories: [{ categoryId, minPhotosAtInventory: 1 }] });
    expect(rules.body).toEqual({ defaultMinPhotos: 0, categories: [{ categoryId, minPhotosAtInventory: 1 }] });

    await prisma.asset.create({ data: { tenantId: TID, assetNumber: 'PLAIN-1', name: 'Plain', rfidTag: 'PLAIN-1', siteId, locationId: zoneId, status: 'active' } });
    const c = await request(app).post('/api/v1/audits').set(as('Administrator')).send({ name: 'Blind', mode: 'blind', siteId });
    await request(app).post(`/api/v1/audits/${c.body.id}/start`).set(as('Administrator'));
    const s1 = await request(app).post(`/api/v1/audits/${c.body.id}/scans`).set(as('Administrator')).send({ tagValue: 'COND-1', locationId: zoneId, conditionGrade: 3 });
    expect(s1.body).toMatchObject({ condition: 'fair', conditionGrade: 3 });
    await request(app).post(`/api/v1/audits/${c.body.id}/scans`).set(as('Administrator')).send({ tagValue: 'PLAIN-1', locationId: zoneId, conditionGrade: 1 });
    await request(app).post(`/api/v1/audits/${c.body.id}/scans`).set(as('Administrator')).send({ tagValue: 'PLAIN-X', locationId: zoneId, conditionGrade: 4 });

    const w = await request(app).get(`/api/v1/audits/${c.body.id}/photo-warnings?locationId=${zoneId}`).set(as('Administrator'));
    expect(w.body.map((x: { tagValue: string; reason: string }) => [x.tagValue, x.reason]).sort()).toEqual([
      ['COND-1', 'below_minimum'], ['PLAIN-1', 'grade_needs_photo'],
    ]);

    const submit = await request(app).post(`/api/v1/audits/${c.body.id}/zones/${zoneId}/submit`).set(as('Administrator'));
    expect(submit.status).toBe(201);
    expect(submit.body.photoWarnings).toHaveLength(2);
  });

  it('refuses rules for another tenant’s category', async () => {
    const r = await request(app).put('/api/v1/condition/photo-rules').set(as('Administrator'))
      .send({ defaultMinPhotos: 0, categories: [{ categoryId: 'not-ours', minPhotosAtInventory: 1 }] });
    expect(r.status).toBe(404);
  });
});
