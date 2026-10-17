import axios from 'axios';
import request from 'supertest';
import { processDepreciationRun } from 'vairiot-worker/depreciation/run-job';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { exportAssetValuationSummary } from '../../services/report-export.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.4 (stage 2.11): impairment. Gate (test plan §8.3): setting an asset to
// grade 1 creates a DRAFT impairment; posting it reduces the carrying amount
// and the next depreciation run uses the reduced base. With D17 (the assessor
// cannot post), the reversal cap (IPSAS 21.68) and correction by an offset.

jest.mock('axios');
const post = axios.post as jest.MockedFunction<typeof axios.post>;

const app = createApp();
const TID = 'test-impairment';
let preparerId = '';
let approverId = '';
let signId = '';
let expensedId = '';
const periods: Record<string, string> = {};

const tokenFor = (sub: string, approve = false) => signAccessToken({
  sub, tenantId: TID, email: `${sub}@impairment.test`, roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', 'report:read', 'report:export', 'accounting:read', 'accounting:write', ...(approve ? ['accounting:approve'] : [])],
});
const as = (sub = preparerId, approve = false) => ({ Authorization: `Bearer ${tokenFor(sub, approve)}` });
const approver = () => as(approverId, true);

async function openMonth(month: number) {
  periods[month] = (await request(app).post('/api/v1/accounting/periods').set(as()).send({ year: 2026, month })).body.id;
  return periods[month];
}

async function postMonth(month: number) {
  const run = (await request(app).post(`/api/v1/accounting/periods/${periods[month]}/runs`).set(as())).body.id;
  await processDepreciationRun(prisma, { tenantId: TID, runId: run });
  expect((await request(app).post(`/api/v1/accounting/runs/${run}/post`).set(approver())).status).toBe(202);
  await processDepreciationRun(prisma, { tenantId: TID, runId: run });
  return prisma.depreciationEntry.findFirstOrThrow({ where: { runId: run, assetId: signId } });
}

const nbv = async () => (await request(app).get(`/api/v1/assets/${signId}`).set(as())).body.depreciation.netBookValue;
const drafts = () => prisma.impairment.findMany({ where: { tenantId: TID, assetId: signId, status: 'DRAFT' } });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  for (const name of ['preparer', 'approver']) {
    const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: `${name}@impairment.test` } }, update: {}, create: { tenantId: TID, email: `${name}@impairment.test`, name } });
    if (name === 'preparer') preparerId = u.id; else approverId = u.id;
  }
  await ensureTestLicence(TID);
  const sgn = await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } });
  signId = (await request(app).post('/api/v1/assets').set(as()).send({ name: 'Sign', assetClassId: sgn.id, purchaseCost: 1000, depreciationStartDate: '2026-08-10' })).body.id;
  expensedId = (await request(app).post('/api/v1/assets').set(as()).send({ name: 'Bracket', assetClassId: sgn.id, purchaseCost: 40 })).body.id;
  await openMonth(9);
  expect((await postMonth(9)).charge.toFixed(2)).toBe('11.90'); // carrying 988.10
  await openMonth(10);
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "impairments" DISABLE TRIGGER "impairments_posted_immutable"');
  await prisma.impairment.updateMany({ where: { tenantId: TID }, data: { correctionOfId: null } });
  await prisma.impairment.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "impairments" ENABLE TRIGGER "impairments_posted_immutable"');
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" DISABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.depreciationEntry.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" ENABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.depreciationRun.deleteMany({ where: { tenantId: TID } });
  await prisma.accountingPeriod.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('S2.4 gate', () => {
  let draftId = '';

  it('raises a DRAFT when the grade drops to one that indicates impairment, once', async () => {
    expect((await request(app).patch(`/api/v1/assets/${signId}`).set(as()).send({ conditionGrade: 1 })).status).toBe(200);
    const [draft] = await drafts();
    expect(draft).toMatchObject({ indicator: 'CONDITION', conditionGrade: 1, raisedBy: preparerId });
    draftId = draft.id;
    await request(app).patch(`/api/v1/assets/${signId}`).set(as()).send({ conditionGrade: 2 }); // 1 → 2: both indicate
    expect(await drafts()).toHaveLength(1);
    await request(app).patch(`/api/v1/assets/${expensedId}`).set(as()).send({ conditionGrade: 1 }); // expensed: not impaired
    expect(await prisma.impairment.count({ where: { tenantId: TID, assetId: expensedId } })).toBe(0);
  });

  it('assesses it against the carrying amount; the assessor cannot post it (D17)', async () => {
    const r = await request(app).put(`/api/v1/accounting/impairments/${draftId}/assessment`).set(as())
      .send({ standard: 'IPSAS_21', method: 'DRC', recoverableAmount: 600, assessmentNotes: 'Post bent; replacement cost less wear' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kind: 'IMPAIRMENT', carryingAmount: '988.1', recoverableAmount: '600', loss: '388.1', assessedBy: preparerId });
    const own = await request(app).post(`/api/v1/accounting/impairments/${draftId}/post`).set(as(preparerId, true)).send({ periodId: periods[10] });
    expect(own.status).toBe(403);
  });

  it('posting lowers the carrying amount and writes IMPAIRED on the asset ledger', async () => {
    const r = await request(app).post(`/api/v1/accounting/impairments/${draftId}/post`).set(approver()).send({ periodId: periods[10] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'POSTED', postedBy: approverId, period: { year: 2026, month: 10 } });
    expect(await nbv()).toBe(600);
    const event = await prisma.assetEvent.findFirst({ where: { tenantId: TID, assetId: signId, eventType: 'IMPAIRED' } });
    expect(event?.payload).toMatchObject({ kind: 'IMPAIRMENT', loss: '388.10', carryingBefore: '988.10', carryingAfter: '600.00', period: '2026-10' });
  });

  it('the next run depreciates the reduced base over the remaining life', async () => {
    const entry = await postMonth(10);
    // 600.00 over the 83 months left: 7.23
    expect([entry.openingNbv.toFixed(2), entry.charge.toFixed(2), entry.closingNbv.toFixed(2)]).toEqual(['600.00', '7.23', '592.77']);
    expect(await nbv()).toBe(592.77);
  });
});

describe('reversal and correction', () => {
  let reversalId = '';

  it('caps a reversal at the carrying amount the asset would have had unimpaired', async () => {
    await openMonth(11);
    const draft = (await request(app).post('/api/v1/accounting/impairments').set(as()).send({ assetId: signId, indicator: 'OTHER', indicatorNotes: 'Repaired' })).body;
    const a = await request(app).put(`/api/v1/accounting/impairments/${draft.id}/assessment`).set(as())
      .send({ standard: 'IPSAS_21', method: 'DRC', recoverableAmount: 2000 });
    // carrying 592.77; outstanding 388.10; unimpaired 1,000 − 2 × 11.90 = 976.20 → 383.43
    expect(a.body).toMatchObject({ kind: 'REVERSAL', loss: '-383.43' });
    const p = await request(app).post(`/api/v1/accounting/impairments/${draft.id}/post`).set(approver()).send({ periodId: periods[11] });
    expect(p.status).toBe(200);
    expect(await nbv()).toBe(976.2);
    reversalId = draft.id;
  });

  it('corrects a posted record with an offset, never an edit', async () => {
    await expect(prisma.impairment.update({ where: { id: reversalId }, data: { loss: 0 } })).rejects.toThrow(/offsetting record/);
    const r = await request(app).post(`/api/v1/accounting/impairments/${reversalId}/correct`).set(approver()).send({ periodId: periods[11], notes: 'Repair not done' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'POSTED', loss: '383.43', correctionOfId: reversalId });
    expect((await prisma.impairment.findUniqueOrThrow({ where: { id: reversalId } })).status).toBe('REVERSED');
    expect(await nbv()).toBe(592.77);
    const again = await request(app).post(`/api/v1/accounting/impairments/${reversalId}/correct`).set(approver()).send({ periodId: periods[11] });
    expect(again.body.code).toBe('NOT_POSTED');
  });

  it('nets impairment in the asset history and in depreciation by class', async () => {
    const h = await request(app).get(`/api/v1/accounting/assets/${signId}/depreciation`).set(as());
    expect(h.body).toMatchObject({ accumulated: '19.13', impaired: '388.10', carryingAmount: '592.77' });
    const c = await request(app).get('/api/v1/accounting/depreciation-by-class?year=2026&month=10').set(as());
    expect(c.body.rows[0]).toMatchObject({ classCode: 'SGN', impaired: '388.10', carryingAmount: '592.77' });
  });
});

describe('drafts', () => {
  it('one draft per asset; a draft can be dismissed; posting needs an assessment and an open period', async () => {
    const d = (await request(app).post('/api/v1/accounting/impairments').set(as()).send({ assetId: signId, indicator: 'IDLE' })).body;
    expect((await request(app).post('/api/v1/accounting/impairments').set(as()).send({ assetId: signId, indicator: 'DAMAGE' })).body.code).toBe('DRAFT_EXISTS');
    expect((await request(app).post(`/api/v1/accounting/impairments/${d.id}/post`).set(approver()).send({ periodId: periods[11] })).body.code).toBe('NOT_ASSESSED');
    await request(app).put(`/api/v1/accounting/impairments/${d.id}/assessment`).set(as()).send({ standard: 'IPSAS_21', method: 'SERVICE_UNITS', recoverableAmount: 100 });
    expect((await request(app).post(`/api/v1/accounting/impairments/${d.id}/post`).set(approver()).send({ periodId: periods[10] })).body.code).toBe('PERIOD_NOT_OPEN');
    const dismissed = await request(app).post(`/api/v1/accounting/impairments/${d.id}/dismiss`).set(as()).send({ notes: 'In use again' });
    expect(dismissed.body.status).toBe('DISMISSED');
    const list = await request(app).get(`/api/v1/accounting/impairments?assetId=${signId}`).set(as());
    expect(list.body.map((i: { status: string }) => i.status).sort()).toEqual(['DISMISSED', 'POSTED', 'POSTED', 'REVERSED']);
  });

  it('refuses an asset that is not recognised, and validates the assessment', async () => {
    expect((await request(app).post('/api/v1/accounting/impairments').set(as()).send({ assetId: expensedId, indicator: 'DAMAGE' })).body.code).toBe('NOT_RECOGNISED');
    expect((await request(app).post('/api/v1/accounting/impairments').set(as()).send({ assetId: signId, indicator: 'WEATHER' })).status).toBe(400);
  });

  it('asks for accounting:approve to post', async () => {
    const r = await request(app).post('/api/v1/accounting/impairments/x/post').set(as()).send({ periodId: 'p' });
    expect(r.status).toBe(403);
  });
});

describe('reports (stage 2.12)', () => {
  it('lists posted impairments, reversals and corrections in the register, and exports it', async () => {
    const r = await request(app).get('/api/v1/accounting/impairment-register').set(as());
    expect(r.body.rows.map((x: { period: string; kind: string; loss: string }) => [x.period, x.kind, x.loss])).toEqual([
      ['2026-10', 'IMPAIRMENT', '388.10'], ['2026-11', 'REVERSAL', '-383.43'], ['2026-11', 'CORRECTION', '383.43'],
    ]);
    expect(r.body.rows[0]).toMatchObject({ assetNumber: expect.any(String), standard: 'IPSAS_21', method: 'DRC', carryingAmount: '988.10', recoverableAmount: '600.00', postedBy: 'approver', assessedBy: 'preparer' });
    expect(r.body.totals).toEqual({ count: 3, losses: '771.53', reversals: '-383.43', net: '388.10' });
    const oct = await request(app).get('/api/v1/accounting/impairment-register?year=2026&month=10').set(as());
    expect(oct.body.totals.count).toBe(1);
    post.mockResolvedValue({ data: Buffer.from('pdf') });
    expect((await request(app).get('/api/v1/reports/export/impairment-register?format=pdf').set(as())).status).toBe(200);
    expect(post.mock.calls.at(-1)![1]).toMatchObject({ report_type: 'impairment-register', summary: { records: 3, net: 388.1 } });
  });

  it('shows the impairment in the valuation summary', async () => {
    post.mockResolvedValue({ data: Buffer.from('pdf') });
    await exportAssetValuationSummary(TID, { format: 'pdf', filters: {} });
    const payload = post.mock.calls.at(-1)![1] as { totals: Record<string, number>; summary: Record<string, number> };
    expect(payload.totals).toMatchObject({ totalImpairment: 388.1 });
    expect(payload.summary).toMatchObject({ grandTotalImpairment: 388.1 });
  });
});
