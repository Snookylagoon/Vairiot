import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { liveState } from '../../services/campaign-map.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Campaign layer of the asset map (Phase 1 W4, stage 1.10).

const app = createApp();
const TID = 'test-campaign-map-tenant';
const EMAIL = 'campaignmap@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let siteId: string;
let zoneA: string;
let zoneB: string;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function asset(name: string, tag: string, extra: Record<string, unknown> = {}) {
  return prisma.asset.create({ data: { tenantId: TID, assetNumber: tag, name, rfidTag: tag, status: 'active', condition: 'good', siteId, ...extra } });
}
async function start(body: Record<string, unknown>) {
  const c = await request(app).post('/api/v1/audits').set(auth()).send(body);
  await request(app).post(`/api/v1/audits/${c.body.id}/start`).set(auth());
  return c.body.id as string;
}
const scan = (campaignId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send(body);
const map = (campaignId: string) => request(app).get(`/api/v1/audits/${campaignId}/map`).set(auth());

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { gis: true, blindAudit: true } }, create: { id: TID, name: 'Campaign Map', onboardingComplete: true, featureFlags: { gis: true, blindAudit: true } } });
  const perms = ['asset:read', 'asset:write', 'audit:read', 'audit:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: perms }, create: { tenantId: TID, name: 'Administrator', permissions: perms } });
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Map Tester', passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  await ensureTestLicence(TID);
  token = (await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID })).body.accessToken;
  siteId = (await prisma.site.create({ data: { tenantId: TID, name: 'Vake Park' } })).id;
  zoneA = (await prisma.location.create({ data: { siteId, name: 'North gate' } })).id;
  zoneB = (await prisma.location.create({ data: { siteId, name: 'South gate' } })).id;
  await asset('Bench', 'MAP-1', { locationId: zoneA, latitude: 41.71, longitude: 44.73 });
  await asset('Lamp', 'MAP-2', { locationId: zoneA, latitude: 41.711, longitude: 44.731 });
  await asset('Sign', 'MAP-3', { locationId: zoneA, latitude: 41.712, longitude: 44.732 });
  await asset('Bin', 'MAP-4', { locationId: zoneA, latitude: 41.713, longitude: 44.733 });
  await asset('Unplaced kiosk', 'MAP-5', { locationId: zoneA });
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditReconciliationItem.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditZoneSubmission.deleteMany({ where: { campaign: { tenantId: TID } } });
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

describe('sighted campaign layer', () => {
  it('colours each expected asset by the scans so far, and places surplus tags', async () => {
    const id = await start({ name: 'Park count', siteId });
    await scan(id, { tagValue: 'MAP-1', locationId: zoneA });
    await scan(id, { tagValue: 'MAP-2', locationId: zoneB });
    await scan(id, { tagValue: 'MAP-3', locationId: zoneA, condition: 'poor' });
    await scan(id, { tagValue: 'MAP-5', locationId: zoneA, latitude: 41.714, longitude: 44.734 });
    await scan(id, { tagValue: 'STRAY-1', latitude: 41.715, longitude: 44.735 });
    await scan(id, { tagValue: 'STRAY-1', latitude: 41.715, longitude: 44.735 });

    const r = await map(id);
    expect(r.status).toBe(200);
    const byName = Object.fromEntries(r.body.points.map((p: { name: string; state: string }) => [p.name, p]));
    expect(byName.Bench.state).toBe('verified');
    expect(byName.Lamp.state).toBe('misplaced');
    expect(byName.Sign.state).toBe('condition_variance');
    expect(byName.Bin.state).toBe('not_scanned');
    expect(byName['Unplaced kiosk']).toMatchObject({ state: 'verified', positionSource: 'scan', latitude: 41.714 });
    expect(byName['STRAY-1']).toMatchObject({ state: 'surplus', assetId: null, positionSource: 'scan' });
    expect(r.body.points.filter((p: { name: string }) => p.name === 'STRAY-1')).toHaveLength(1);
    expect(r.body.counts).toMatchObject({ verified: 2, misplaced: 1, condition_variance: 1, not_scanned: 1, surplus: 1 });
    expect(r.body.unplaced).toBe(0);
  });
});

describe('blind campaign layer', () => {
  it('shows only progress while the count is running', async () => {
    const id = await start({ name: 'Blind park count', mode: 'blind', siteId });
    await scan(id, { tagValue: 'MAP-1', locationId: zoneA });
    await scan(id, { tagValue: 'STRAY-2', locationId: zoneA, latitude: 41.7, longitude: 44.7 });
    const r = await map(id);
    const states = new Set(r.body.points.map((p: { state: string }) => p.state));
    expect([...states].sort()).toEqual(['not_scanned', 'scanned']);
    expect(r.body.points.some((p: { name: string }) => p.name === 'STRAY-2')).toBe(false);
    expect(r.body.unplaced).toBe(1);
  });
});

describe('access', () => {
  it('answers 404 with GIS off or for another tenant’s campaign', async () => {
    const id = await start({ name: 'Hidden', siteId });
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { blindAudit: true } } });
    expect((await map(id)).status).toBe(404);
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { gis: true, blindAudit: true } } });
    expect((await map('no-such-campaign')).status).toBe(404);
  });

  it('marks unscanned assets missing once a campaign is complete', () => {
    expect(liveState({ locationId: null, condition: 'good' }, undefined, true)).toBe('missing');
  });
});
