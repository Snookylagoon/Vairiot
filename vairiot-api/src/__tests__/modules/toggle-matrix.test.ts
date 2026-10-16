import request from 'supertest';
import { ALL_PERMISSIONS, MODULES, MODULE_KEYS, type ModuleKey } from 'vairiot-shared';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// The toggle matrix (D7, test plan §8, stage 2.2): for every module in the
// registry, each of its routes answers 404 while the module is off and is
// served once it is on; switching back and forth changes no data. Modules are
// switched through the platform console's endpoint, which is audited.

const app = createApp();
const TID = 'test-toggle-matrix';
const PLATFORM = 'test-toggle-matrix-platform';
let userId = '';
let campaignId = '';

const tenantToken = () => signAccessToken({
  sub: userId, tenantId: TID, email: 'matrix@matrix.test', roles: ['Company Admin'], permissions: [...ALL_PERMISSIONS],
});
const platformToken = (role = 'Platform Super Admin') => signAccessToken({
  sub: userId, tenantId: PLATFORM, email: 'matrix@matrix.test', roles: [role], permissions: [...ALL_PERMISSIONS],
});

function call(method: string, path: string) {
  const url = `/api/v1${path.replace(':campaignId', campaignId)}`;
  const r = request(app);
  const req = method === 'GET' ? r.get(url) : method === 'PUT' ? r.put(url) : method === 'POST' ? r.post(url) : r.delete(url);
  return req.set('Authorization', `Bearer ${tenantToken()}`);
}

const setModule = (key: ModuleKey, enabled: boolean, token = platformToken()) =>
  request(app).put(`/api/v1/admin/platform/tenants/${TID}/modules/${key}`)
    .set('Authorization', `Bearer ${token}`).send({ enabled });

const positions = async () => JSON.stringify(await prisma.asset.findMany({
  where: { tenantId: TID }, orderBy: { id: 'asc' }, select: { id: true, latitude: true, longitude: true, conditionGrade: true },
}));

beforeAll(async () => {
  for (const id of [TID, PLATFORM]) {
    await prisma.tenant.upsert({ where: { id }, update: { onboardingComplete: true, featureFlags: {} }, create: { id, name: id, onboardingComplete: true } });
  }
  userId = (await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'matrix@matrix.test' } },
    update: {}, create: { tenantId: TID, email: 'matrix@matrix.test', name: 'Matrix tester' },
  })).id;
  await ensureTestLicence(TID);
  // Data that GIS routes return: a positioned asset and a campaign over it.
  await setModule('gis', true);
  const asset = await call('POST', '/assets').send({ name: 'Matrix sign', latitude: 41.7, longitude: 44.8 });
  expect(asset.status).toBe(201);
  const campaign = await call('POST', '/audits').send({ name: 'Matrix count' });
  expect(campaign.status).toBe(201);
  campaignId = campaign.body.id;
  await setModule('gis', false);
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: { in: [TID, PLATFORM] } } });
  await prisma.auditSnapshotAsset.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TID, PLATFORM] } } });
  await prisma.$disconnect();
});

const guarded = MODULES.filter((m) => m.apiRoutes.length > 0);

describe.each(guarded.map((m) => [m.key, m] as const))('module %s', (key, mod) => {
  it.each(mod.apiRoutes.map((r) => [`${r.method} ${r.path}`, r] as const))('%s: 404 off, served on', async (_label, route) => {
    expect((await call(route.method, route.path)).status).toBe(404);
    expect((await setModule(key, true)).status).toBe(200);
    const on = await call(route.method, route.path);
    expect(on.status).toBeLessThan(400);
    expect((await setModule(key, false)).status).toBe(200);
    expect((await call(route.method, route.path)).status).toBe(404);
  });
});

describe('switching', () => {
  it('changes no data, however often', async () => {
    const before = await positions();
    for (const key of MODULE_KEYS) {
      await setModule(key, true);
      await setModule(key, false);
    }
    expect(await positions()).toBe(before);
  });

  it('is listed and audited against the tenant', async () => {
    const list = await request(app).get(`/api/v1/admin/platform/tenants/${TID}/modules`)
      .set('Authorization', `Bearer ${platformToken('Licensing Authority')}`);
    expect(list.status).toBe(200);
    expect(list.body.map((m: { key: string }) => m.key)).toEqual([...MODULE_KEYS]);

    await setModule('ipsas', true);
    await setModule('ipsas', true); // no change, no event
    await flushAuditEvents();
    const events = await prisma.auditEvent.findMany({ where: { tenantId: TID, action: { in: ['module_enabled', 'module_disabled'] }, entityId: TID } });
    const ipsasOn = events.filter((e) => e.action === 'module_enabled' && (e.metadata as { module?: string })?.module === 'ipsas');
    expect(ipsasOn.length).toBeGreaterThan(0);
    const latest = await request(app).get(`/api/v1/admin/platform/tenants/${TID}/modules`).set('Authorization', `Bearer ${platformToken()}`);
    expect(latest.body.find((m: { key: string }) => m.key === 'ipsas').enabled).toBe(true);
    await setModule('ipsas', false);
  });

  it('is for the Platform Super Admin only, and checks its input', async () => {
    expect((await setModule('gis', true, platformToken('Licensing Authority'))).status).toBe(403);
    expect((await setModule('gis', true, tenantToken())).status).toBe(403);
    expect((await request(app).put(`/api/v1/admin/platform/tenants/${TID}/modules/payroll`)
      .set('Authorization', `Bearer ${platformToken()}`).send({ enabled: true })).status).toBe(404);
    expect((await request(app).put(`/api/v1/admin/platform/tenants/no-such-tenant/modules/gis`)
      .set('Authorization', `Bearer ${platformToken()}`).send({ enabled: true })).status).toBe(404);
    expect((await setModule('gis', 'yes' as unknown as boolean)).status).toBe(400);
  });
});

describe('ipsas', () => {
  it('serves the ledger settings with the tenant’s conventions, to accounting:read only', async () => {
    await setModule('ipsas', true);
    const r = await call('GET', '/accounting/settings');
    expect(r.body).toMatchObject({ measurement: 'cost', period: 'monthly', rounding: { mode: 'half_up', places: 2 } });
    const noRead = signAccessToken({ sub: userId, tenantId: TID, email: 'matrix@matrix.test', roles: ['Viewer'], permissions: ['asset:read'] });
    expect((await request(app).get('/api/v1/accounting/settings').set('Authorization', `Bearer ${noRead}`)).status).toBe(403);
    await setModule('ipsas', false);
  });
});
