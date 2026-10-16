import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { splitTemplateCost } from '../../services/component.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.2 (stage 2.5): assets held as parts, one level deep. Gate (test plan
// §8.3): a "Signalised junction" template creates five assets; the parent's
// roll-up NBV equals the sum.

const app = createApp();
const TID = 'test-components';
const OFF = 'test-components-off';
let userId = '';
let sigId = '';
let templateId = '';
let siteA = '';
let siteB = '';

const PERMS = ['asset:read', 'asset:write', 'accounting:read', 'accounting:write'];
const token = (tenantId = TID, sub = userId) => signAccessToken({ sub, tenantId, email: 'parts@parts.test', roles: ['Company Admin'], permissions: PERMS });
const as = (t = token()) => ({ Authorization: `Bearer ${t}` });
const asset = (id: string) => prisma.asset.findUniqueOrThrow({ where: { id } });
const create = (body: Record<string, unknown>) => request(app).post('/api/v1/assets').set(as()).send(body);
const link = (id: string, body: Record<string, unknown>) => request(app).put(`/api/v1/accounting/assets/${id}/parent`).set(as()).send(body);

const JUNCTION = {
  code: 'JUNCTION', name: 'Signalised junction',
  lines: [
    { role: 'controller', name: 'Controller', lifeMonths: 120, costSharePct: 35 },
    { role: 'pole', name: 'Poles', lifeMonths: 240, costSharePct: 25 },
    { role: 'head', name: 'Signal heads', lifeMonths: 120, costSharePct: 25 },
    { role: 'detector', name: 'Detectors', lifeMonths: 96, costSharePct: 15 },
  ],
};

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true, gis: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true, gis: true } } });
  await prisma.tenant.upsert({ where: { id: OFF }, update: { onboardingComplete: true, featureFlags: {} }, create: { id: OFF, name: OFF, onboardingComplete: true } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'parts@parts.test' } }, update: {}, create: { tenantId: TID, email: 'parts@parts.test', name: 'Parts' } })).id;
  await prisma.user.upsert({ where: { tenantId_email: { tenantId: OFF, email: 'parts@parts.test' } }, update: {}, create: { id: `${userId}-off`, tenantId: OFF, email: 'parts@parts.test', name: 'Off' } });
  await ensureTestLicence(TID);
  await ensureTestLicence(OFF);
  sigId = (await prisma.assetClass.create({ data: { tenantId: TID, code: 'SIG', name: 'Traffic signals', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 120 } })).id;
  siteA = (await prisma.site.create({ data: { tenantId: TID, name: 'Rustaveli' } })).id;
  siteB = (await prisma.site.create({ data: { tenantId: TID, name: 'Depot' } })).id;
});

afterAll(async () => {
  await flushAuditEvents();
  for (const id of [TID, OFF]) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
    await prisma.transfer.deleteMany({ where: { tenantId: id } });
    await prisma.disposal.deleteMany({ where: { tenantId: id } });
    await prisma.asset.updateMany({ where: { tenantId: id }, data: { parentAssetId: null, componentRole: null } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.componentTemplate.deleteMany({ where: { tenantId: id } });
    await prisma.site.deleteMany({ where: { tenantId: id } });
    await prisma.assetClass.deleteMany({ where: { tenantId: id } });
    await removeTestLicence(id);
    await prisma.user.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe('cost split', () => {
  it('splits by share, exact to the tetri, the parent keeping the rest', () => {
    const lines = [1, 2, 3].map((i) => ({ role: 'x', name: `P${i}`, costSharePct: 33.33 }));
    const { parent, parts } = splitTemplateCost(100, lines);
    expect(parts.map((p) => p!.toFixed(2))).toEqual(['33.33', '33.33', '33.33']);
    expect(parent!.toFixed(2)).toBe('0.01');
    expect(splitTemplateCost(null, lines).parts).toEqual([null, null, null]);
  });
});

describe('component templates', () => {
  it('are created and listed', async () => {
    const r = await request(app).post('/api/v1/accounting/component-templates').set(as()).send({ ...JUNCTION, assetClassId: sigId });
    expect(r.status).toBe(201);
    templateId = r.body.id;
    const list = await request(app).get('/api/v1/accounting/component-templates').set(as());
    expect(list.body[0]).toMatchObject({ code: 'JUNCTION', assetClass: { code: 'SIG' } });
  });

  it('refuse shares over 100 %, unknown classes and duplicate codes', async () => {
    const over = { ...JUNCTION, code: 'OVER', lines: [...JUNCTION.lines, { role: 'cabinet', name: 'Cabinet', costSharePct: 1 }] };
    expect((await request(app).post('/api/v1/accounting/component-templates').set(as()).send(over)).status).toBe(400);
    expect((await request(app).post('/api/v1/accounting/component-templates').set(as()).send({ ...JUNCTION, code: 'BAD', assetClassId: 'nope' })).status).toBe(400);
    expect((await request(app).post('/api/v1/accounting/component-templates').set(as()).send(JUNCTION)).status).toBe(409);
  });
});

describe('S2.2 gate', () => {
  let group: { asset: { id: string; depreciation: { netBookValue: number } }; components: Array<{ id: string; componentRole: string; usefulLifeMonths: number; capitalisedCost: string; recognitionStatus: string; depreciation: { netBookValue: number } }>; rollUp: { capitalizedCost: number; netBookValue: number } };

  it('a "Signalised junction" template creates five assets', async () => {
    const r = await request(app).post(`/api/v1/accounting/component-templates/${templateId}/assets`).set(as())
      .send({ name: 'Rustaveli × Melikishvili', totalCost: 20000, siteId: siteA, depreciationStartDate: '2024-01-01' });
    expect(r.status).toBe(201);
    group = r.body;
    const ids = [group.asset.id, ...group.components.map((c) => c.id)];
    expect(await prisma.asset.count({ where: { id: { in: ids } } })).toBe(5);
    expect(group.components.map((c) => [c.componentRole, c.capitalisedCost, c.usefulLifeMonths])).toEqual([
      ['controller', '7000', 120], ['pole', '5000', 240], ['head', '5000', 120], ['detector', '3000', 96],
    ]);
    const parts = await prisma.asset.findMany({ where: { parentAssetId: group.asset.id } });
    expect(parts.every((p) => p.siteId === siteA && p.assetClassId === sigId)).toBe(true);
    expect(group.components.every((c) => c.recognitionStatus === 'RECOGNISED')).toBe(true);
  });

  it('the parent’s roll-up NBV equals the sum', () => {
    const sum = [group.asset, ...group.components].reduce((t, a) => t + a.depreciation.netBookValue, 0);
    expect(group.rollUp.netBookValue).toBeCloseTo(sum, 2);
    expect(group.rollUp.capitalizedCost).toBe(20000);
    expect(group.rollUp.netBookValue).toBeLessThan(20000);
  });
});

describe('structure', () => {
  let parentId = '';
  let partId = '';

  it('a new component starts where its parent is', async () => {
    parentId = (await create({ name: 'Shelter', assetClassId: sigId, purchaseCost: 300, siteId: siteA })).body.id;
    const part = await create({ name: 'Shelter roof', parentAssetId: parentId, componentRole: 'roof', assetClassId: sigId, purchaseCost: 300 });
    partId = part.body.id;
    expect(part.body).toMatchObject({ parentAssetId: parentId, componentRole: 'roof', siteId: siteA });
  });

  it('recognises on the whole: two GEL 300 parts make a GEL 600 asset', async () => {
    expect((await asset(parentId)).recognitionStatus).toBe('RECOGNISED');
    expect((await asset(partId)).recognitionStatus).toBe('RECOGNISED');
  });

  it('is one level deep, in the service and in the database', async () => {
    expect((await create({ name: 'Bolt', parentAssetId: partId })).status).toBe(400);
    expect((await link(parentId, { parentAssetId: partId })).status).toBe(400);
    expect((await link(parentId, { parentAssetId: parentId })).status).toBe(400);
    const loose = await create({ name: 'Loose', purchaseCost: 10 });
    await expect(prisma.asset.update({ where: { id: loose.body.id }, data: { parentAssetId: partId } })).rejects.toThrow(/cannot have components/);
    await expect(prisma.asset.update({ where: { id: parentId }, data: { parentAssetId: loose.body.id } })).rejects.toThrow(/cannot become a component/);
  });

  it('components follow the parent unless moved on their own', async () => {
    const own = await create({ name: 'Shelter bench', parentAssetId: parentId, componentRole: 'bench', purchaseCost: 50 });
    await request(app).patch(`/api/v1/assets/${own.body.id}`).set(as()).send({ siteId: siteB });
    await request(app).patch(`/api/v1/assets/${parentId}`).set(as()).send({ siteId: siteB, latitude: 41.7, longitude: 44.8 });
    expect(await asset(partId)).toMatchObject({ siteId: siteB, latitude: 41.7, longitude: 44.8 });
    await request(app).post('/api/v1/transfers').set(as()).send({ assetId: parentId, toSiteId: siteA });
    expect((await asset(partId)).siteId).toBe(siteA);
    expect((await asset(own.body.id)).siteId).toBe(siteA); // back with the parent once more
  });

  it('a detached part is judged on its own', async () => {
    const r = await link(partId, { parentAssetId: null });
    expect(r.body).toMatchObject({ parentAssetId: null, componentRole: null });
    expect((await asset(partId)).recognitionStatus).toBe('EXPENSED');
    await link(partId, { parentAssetId: parentId, componentRole: 'roof' });
    expect((await asset(partId)).recognitionStatus).toBe('RECOGNISED');
  });

  it('shows a component its parent', async () => {
    const r = await request(app).get(`/api/v1/accounting/assets/${partId}/components`).set(as());
    expect(r.body.parent).toMatchObject({ id: parentId, name: 'Shelter' });
    expect(r.body.rollUp).toBeNull();
  });

  it('asks what to do with the parts when the parent is disposed', async () => {
    const url = `/api/v1/assets/${parentId}/dispose`;
    const body = { disposalDate: '2026-10-16', disposalMethod: 'scrapped' };
    const refused = await request(app).post(url).set(as()).send(body);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('COMPONENTS_ACTIVE');
    expect((await request(app).post(url).set(as()).send({ ...body, components: 'sell' })).status).toBe(400);
    expect((await request(app).post(url).set(as()).send({ ...body, components: 'dispose' })).status).toBe(200);
    const parts = await prisma.asset.findMany({ where: { parentAssetId: parentId } });
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p.status === 'disposed')).toBe(true);
  });
});

describe('with ipsas off', () => {
  it('ignores the parent', async () => {
    const t = token(OFF, `${userId}-off`);
    const parent = await request(app).post('/api/v1/assets').set(as(t)).send({ name: 'P' });
    const part = await request(app).post('/api/v1/assets').set(as(t)).send({ name: 'C', parentAssetId: parent.body.id });
    expect(part.body.parentAssetId).toBeNull();
  });
});
