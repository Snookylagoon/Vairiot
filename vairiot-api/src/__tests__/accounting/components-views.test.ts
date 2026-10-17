import axios from 'axios';
import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { exportAssetValuationSummary } from '../../services/report-export.service';
import { fixedAssetRegister } from '../../services/report.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Stage 2.6: components where people see them — the register list (markers
// and a roll-up filter), the asset (its parts, for the apps), template parts
// added to an existing asset, and the roll-up option of the register reports.

jest.mock('axios');
const post = axios.post as jest.MockedFunction<typeof axios.post>;

const app = createApp();
const TID = 'test-component-views';
let userId = '';
let parentId = '';
let templateId = '';

const token = () => signAccessToken({
  sub: userId, tenantId: TID, email: 'views@views.test', roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', 'accounting:read', 'accounting:write'],
});
const as = () => ({ Authorization: `Bearer ${token()}` });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'views@views.test' } }, update: {}, create: { tenantId: TID, email: 'views@views.test', name: 'Views' } })).id;
  await ensureTestLicence(TID);
  const sig = await prisma.assetClass.create({ data: { tenantId: TID, code: 'SIG', name: 'Signals', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 120 } });
  const site = await prisma.site.create({ data: { tenantId: TID, name: 'Rustaveli' } });
  const category = await prisma.category.create({ data: { tenantId: TID, name: 'Signals' } });
  templateId = (await prisma.componentTemplate.create({ data: {
    tenantId: TID, code: 'JUNCTION', name: 'Junction', assetClassId: sig.id,
    lines: [{ role: 'controller', name: 'Controller', costSharePct: 60 }, { role: 'pole', name: 'Poles', costSharePct: 40 }],
  } })).id;
  parentId = (await request(app).post('/api/v1/assets').set(as())
    .send({ name: 'Junction 1', assetClassId: sig.id, purchaseCost: 1000, siteId: site.id, categoryId: category.id })).body.id;
  await request(app).post('/api/v1/assets').set(as()).send({ name: 'Standalone sign', assetClassId: sig.id, purchaseCost: 700, siteId: site.id, categoryId: category.id });
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.updateMany({ where: { tenantId: TID }, data: { parentAssetId: null, componentRole: null } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.componentTemplate.deleteMany({ where: { tenantId: TID } });
  await prisma.category.deleteMany({ where: { tenantId: TID } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

it('adds a template’s parts to an existing asset, named after it, its own cost kept', async () => {
  const r = await request(app).post(`/api/v1/accounting/component-templates/${templateId}/assets`).set(as())
    .send({ name: 'ignored', parentAssetId: parentId, totalCost: 2000 });
  expect(r.status).toBe(201);
  expect(r.body.asset.id).toBe(parentId);
  expect(r.body.components.map((c: { name: string; capitalisedCost: string }) => [c.name, c.capitalisedCost]))
    .toEqual([['Junction 1 — Controller', '1200'], ['Junction 1 — Poles', '800']]);
  expect(r.body.rollUp.capitalizedCost).toBe(3000);
});

it('marks parents and parts in the list, and rolls parts up on request', async () => {
  const all = await request(app).get('/api/v1/assets?pageSize=50').set(as());
  const byName = Object.fromEntries(all.body.assets.map((a: { name: string }) => [a.name, a]));
  expect(byName['Junction 1']._count.components).toBe(2);
  expect(byName['Junction 1 — Poles'].parentAsset).toMatchObject({ id: parentId, name: 'Junction 1' });
  const rolled = await request(app).get('/api/v1/assets?pageSize=50&rollUp=true').set(as());
  expect(rolled.body.assets.map((a: { name: string }) => a.name).sort()).toEqual(['Junction 1', 'Standalone sign']);
});

it('gives the apps an asset’s parts with the asset', async () => {
  const r = await request(app).get(`/api/v1/assets/${parentId}`).set(as());
  expect(r.body.components.map((c: { componentRole: string }) => c.componentRole)).toEqual(['controller', 'pole']);
});

it('rolls parts into their parent in the fixed asset register', async () => {
  const rows = await fixedAssetRegister(TID, { rollUp: 'true' });
  const junction = rows.find((r) => r.name.startsWith('Junction 1'))!;
  expect(rows).toHaveLength(2);
  expect(junction).toMatchObject({ name: 'Junction 1 (+2 parts)', purchaseCost: 3000, capitalizedCost: 3000 });
  expect((await fixedAssetRegister(TID)).length).toBe(4);
});

it('counts parts under their parent in the valuation summary', async () => {
  post.mockResolvedValue({ data: Buffer.from('pdf') });
  await exportAssetValuationSummary(TID, { format: 'pdf', filters: { rollUp: 'true' } });
  const rolled = post.mock.calls.at(-1)![1] as { rows: Array<{ assetCount: number; totalCapitalizedCost: number }> };
  expect(rolled.rows).toEqual([expect.objectContaining({ assetCount: 2, totalCapitalizedCost: 3700 })]);
  await exportAssetValuationSummary(TID, { format: 'pdf', filters: {} });
  const flat = post.mock.calls.at(-1)![1] as { rows: Array<{ assetCount: number; totalCapitalizedCost: number }> };
  expect(flat.rows).toEqual([expect.objectContaining({ assetCount: 4, totalCapitalizedCost: 3700 })]);
});
