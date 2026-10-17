import axios from 'axios';
import request from 'supertest';
import { processDepreciationRun } from 'vairiot-worker/depreciation/run-job';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { sumMoney } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { exportAssetValuationSummary } from '../../services/report-export.service';
import { depreciationRegister } from '../../services/report.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Stage 2.9: once depreciation is posted, the register, the asset, disposal
// and the reports show the ledger's figures instead of the projection. Gate
// (test plan §8.3): the schedule report matches the posted entries. Plus
// depreciation by class.

jest.mock('axios');
const post = axios.post as jest.MockedFunction<typeof axios.post>;

const app = createApp();
const TID = 'test-ledger-overlay';
let preparerId = '';
let approverId = '';
const ids: Record<string, string> = {};

const tokenFor = (sub: string, approve = false) => signAccessToken({
  sub, tenantId: TID, email: `${sub}@overlay.test`, roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', 'report:read', 'report:export', 'accounting:read', 'accounting:write', ...(approve ? ['accounting:approve'] : [])],
});
const as = (sub = preparerId, approve = false) => ({ Authorization: `Bearer ${tokenFor(sub, approve)}` });

async function postMonth(year: number, month: number) {
  const period = (await request(app).post('/api/v1/accounting/periods').set(as()).send({ year, month })).body.id;
  const run = (await request(app).post(`/api/v1/accounting/periods/${period}/runs`).set(as())).body.id;
  await processDepreciationRun(prisma, { tenantId: TID, runId: run });
  const r = await request(app).post(`/api/v1/accounting/runs/${run}/post`).set(as(approverId, true));
  expect(r.status).toBe(202);
  await processDepreciationRun(prisma, { tenantId: TID, runId: run });
}

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  for (const name of ['preparer', 'approver']) {
    const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: `${name}@overlay.test` } }, update: {}, create: { tenantId: TID, email: `${name}@overlay.test`, name } });
    if (name === 'preparer') preparerId = u.id; else approverId = u.id;
  }
  await ensureTestLicence(TID);
  const sgn = await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } });
  const fur = await prisma.assetClass.create({ data: { tenantId: TID, code: 'FUR', name: 'Furniture', ipsasClass: 'FURNITURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 120 } });
  const create = async (name: string, body: Record<string, unknown>) => {
    ids[name] = (await request(app).post('/api/v1/assets').set(as()).send({ name, ...body })).body.id;
  };
  await create('Sign', { assetClassId: sgn.id, purchaseCost: 1000, depreciationStartDate: '2026-08-10' });
  await create('Desk', { assetClassId: fur.id, purchaseCost: 1200, depreciationStartDate: '2026-09-10' });
  await create('Unposted', { assetClassId: sgn.id, purchaseCost: 840, depreciationStartDate: '2027-01-10' });
  await postMonth(2026, 9);
  await postMonth(2026, 10);
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" DISABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.depreciationEntry.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" ENABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.depreciationRun.deleteMany({ where: { tenantId: TID } });
  await prisma.accountingPeriod.deleteMany({ where: { tenantId: TID } });
  await prisma.disposal.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

it('shows an asset’s posted figures, and the projection for one with none', async () => {
  const sign = await request(app).get(`/api/v1/assets/${ids.Sign}`).set(as());
  expect(sign.body.depreciation).toMatchObject({ source: 'ledger', accumulatedDepreciation: 23.8, netBookValue: 976.2, monthlyDepreciation: 11.9 });
  const unposted = await request(app).get(`/api/v1/assets/${ids.Unposted}`).set(as());
  expect(unposted.body.depreciation.source).toBe('projection');
});

it('S2.3 gate: the schedule report matches the posted entries', async () => {
  const rows = await depreciationRegister(TID);
  for (const name of ['Sign', 'Desk']) {
    const entries = await prisma.depreciationEntry.findMany({ where: { assetId: ids[name] } });
    const row = rows.find((r) => r.name === name)!;
    expect(row.accumulatedDepreciation).toBe(Number(sumMoney(entries.map((e) => e.charge)).toFixed(2)));
    expect(row.netBookValue).toBe(Number(entries.reduce((a, e) => (a.createdAt > e.createdAt ? a : e)).closingNbv.toFixed(2)));
  }
});

it('values the register from the ledger in the valuation summary', async () => {
  post.mockResolvedValue({ data: Buffer.from('pdf') });
  await exportAssetValuationSummary(TID, { format: 'pdf', filters: {} });
  const payload = post.mock.calls.at(-1)![1] as { rows: Array<{ totalDepreciation: number }> };
  expect(sumMoney(payload.rows.map((r) => r.totalDepreciation)).toFixed(2)).toBe('43.80'); // sign 23.80 + desk 20.00, both from the ledger
});

it('reports posted depreciation by class for the latest period, and exports it', async () => {
  const r = await request(app).get('/api/v1/accounting/depreciation-by-class').set(as());
  expect(r.body.period).toEqual({ year: 2026, month: 10 });
  expect(r.body.rows).toEqual([
    { classCode: 'FUR', className: 'Furniture', assetCount: 1, periodCharge: '10.00', accumulated: '20.00', impaired: '0.00', cost: '1200.00', carryingAmount: '1180.00' },
    { classCode: 'SGN', className: 'Signs', assetCount: 1, periodCharge: '11.90', accumulated: '23.80', impaired: '0.00', cost: '1000.00', carryingAmount: '976.20' },
  ]);
  const sep = await request(app).get('/api/v1/accounting/depreciation-by-class?year=2026&month=9').set(as());
  expect(sep.body.totals).toMatchObject({ periodCharge: '21.90', accumulated: '21.90' });
  post.mockResolvedValue({ data: Buffer.from('pdf') });
  const exported = await request(app).get('/api/v1/reports/export/depreciation-by-class?format=pdf').set(as());
  expect(exported.status).toBe(200);
  expect(post.mock.calls.at(-1)![1]).toMatchObject({ report_type: 'depreciation-by-class', summary: { period: '2026-10', totalCharge: 21.9 } });
});

it('takes the net book value at disposal from the ledger', async () => {
  const r = await request(app).post(`/api/v1/assets/${ids.Desk}/dispose`).set(as())
    .send({ disposalDate: '2026-11-05', disposalMethod: 'sale', disposalValue: 1000 });
  expect(r.body.disposal).toMatchObject({ netBookValueAtDisposal: '1180', gainLoss: '-180' });
});
