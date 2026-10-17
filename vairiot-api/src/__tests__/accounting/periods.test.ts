import request from 'supertest';
import { processDepreciationRun } from 'vairiot-worker/depreciation/run-job';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.3 (stage 2.8): periods and depreciation runs. Gate (test plan §8.3):
// running October 2026 on seeded data posts entries; re-running a locked
// period is refused. With D17: the preparer cannot post; entries are
// append-only and corrected by reversal.

const app = createApp();
const TID = 'test-periods';
let preparerId = '';
let approverId = '';
let signId = '';
let pumpId = '';

const READ_WRITE = ['asset:read', 'asset:write', 'accounting:read', 'accounting:write'];
const tokenFor = (sub: string, approve = false) => signAccessToken({
  sub, tenantId: TID, email: `${sub}@periods.test`, roles: ['Company Admin'],
  permissions: approve ? [...READ_WRITE, 'accounting:approve'] : READ_WRITE,
});
const preparer = () => ({ Authorization: `Bearer ${tokenFor(preparerId)}` });
const approver = () => ({ Authorization: `Bearer ${tokenFor(approverId, true)}` });
const api = (method: 'get' | 'post' | 'put', path: string, auth = preparer()) => request(app)[method](`/api/v1/accounting${path}`).set(auth);
const openPeriod = async (year: number, month: number) => (await api('post', '/periods').send({ year, month })).body.id as string;
/** What the worker would do with the run's queued action (stage 2.10). */
const work = (runId: string) => processDepreciationRun(prisma, { tenantId: TID, runId });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  await prisma.company.upsert({
    where: { tenantId: TID }, update: { timezone: 'Asia/Tbilisi', currency: 'GEL' },
    create: { tenantId: TID, legalName: 'Periods Test', addressLine1: 'x', city: 'Tbilisi', country: 'GE', primaryContactName: 'x', primaryContactEmail: 'x@periods.test', timezone: 'Asia/Tbilisi', currency: 'GEL' },
  });
  for (const name of ['preparer', 'approver']) {
    const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: `${name}@periods.test` } }, update: {}, create: { tenantId: TID, email: `${name}@periods.test`, name } });
    if (name === 'preparer') preparerId = u.id; else approverId = u.id;
  }
  await ensureTestLicence(TID);
  const sgn = await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } });
  const create = (body: Record<string, unknown>) => request(app).post('/api/v1/assets').set(preparer()).send(body).then((r) => r.body.id as string);
  signId = await create({ name: 'Give way sign', assetClassId: sgn.id, purchaseCost: 1000, depreciationStartDate: '2026-01-10' });
  await create({ name: 'Bracket', assetClassId: sgn.id, purchaseCost: 200, depreciationStartDate: '2026-01-10' }); // EXPENSED
  await create({ name: 'Future sign', assetClassId: sgn.id, purchaseCost: 840, depreciationStartDate: '2026-12-01' });
  pumpId = await create({
    name: 'Pump', assetClassId: sgn.id, purchaseCost: 5000, depreciationStartDate: '2026-01-10', depreciationMethod: 'units_of_production',
  });
  await prisma.asset.update({ where: { id: pumpId }, data: { expectedTotalUnits: 100000 } });
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" DISABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.depreciationEntry.deleteMany({ where: { tenantId: TID } });
  await prisma.$executeRawUnsafe('ALTER TABLE "depreciation_entries" ENABLE TRIGGER "depreciation_entries_append_only"');
  await prisma.assetUsage.deleteMany({ where: { tenantId: TID } });
  await prisma.depreciationRun.updateMany({ where: { tenantId: TID }, data: { reversalOfRunId: null } });
  await prisma.depreciationRun.deleteMany({ where: { tenantId: TID } });
  await prisma.accountingPeriod.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await prisma.company.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('S2.3 gate', () => {
  let october = '';
  let runId = '';

  it('running October 2026 previews, then posts entries', async () => {
    october = await openPeriod(2026, 10);
    await api('put', `/periods/${october}/usage/${pumpId}`).send({ units: 2500 });
    const queued = await api('post', `/periods/${october}/runs`);
    expect(queued.status).toBe(202);
    runId = queued.body.id;
    expect(queued.body).toMatchObject({ status: 'DRAFT', jobState: 'QUEUED', pendingAction: 'PREPARE' });
    await work(runId);
    const draft = { body: await prisma.depreciationRun.findUniqueOrThrow({ where: { id: runId } }) };
    expect(draft.body).toMatchObject({ status: 'DRAFT', jobState: 'DONE', assetCount: 2 });
    expect(draft.body.totalCharge.toFixed(2)).toBe('136.90');
    expect(draft.body.preview).toMatchObject({ byClass: [{ classCode: 'SGN', count: 2, charge: '136.90' }], skipped: { not_recognised: 1, not_started: 1 } });

    expect((await api('post', `/runs/${runId}/post`, { Authorization: `Bearer ${tokenFor(preparerId, true)}` })).status).toBe(403);
    expect((await api('post', `/runs/${runId}/post`, approver())).status).toBe(202);
    await work(runId);
    const posted = { body: await prisma.depreciationRun.findUniqueOrThrow({ where: { id: runId } }) };
    expect(posted.body).toMatchObject({ status: 'POSTED', postedBy: approverId, jobState: 'DONE' });
    const entries = await prisma.depreciationEntry.findMany({ where: { runId }, orderBy: { charge: 'asc' } });
    expect(entries.map((e) => [e.method, e.charge.toFixed(2), e.closingNbv.toFixed(2)])).toEqual([
      ['straight_line', '11.90', '988.10'], ['units_of_production', '125.00', '4875.00'],
    ]);
    expect((await prisma.accountingPeriod.findUniqueOrThrow({ where: { id: october } })).status).toBe('CLOSED');
  });

  it('a closed period takes no new run; reopened, it still has its posted run', async () => {
    expect((await api('post', `/periods/${october}/runs`)).body.code).toBe('PERIOD_NOT_OPEN');
    expect((await api('post', `/periods/${october}/reopen`, approver())).body.status).toBe('OPEN');
    expect((await api('post', `/periods/${october}/runs`)).body.code).toBe('ALREADY_POSTED');
  });

  it('re-running a locked period is refused', async () => {
    const november = await openPeriod(2026, 11);
    expect((await api('post', `/periods/${november}/lock`, approver())).body.status).toBe('LOCKED');
    expect((await api('post', `/periods/${november}/runs`)).status).toBe(409);
    expect((await api('post', `/periods/${november}/reopen`, approver())).body.code).toBe('PERIOD_LOCKED');
  });

  it('corrects by reversal, never by editing, and runs again', async () => {
    await expect(prisma.depreciationEntry.updateMany({ where: { runId }, data: { charge: 0 } })).rejects.toThrow(/append-only/);
    const reversal = await api('post', `/runs/${runId}/reverse`, approver()).send({ notes: 'Wrong usage' });
    expect(reversal.status).toBe(202);
    await work(runId);
    expect(await prisma.depreciationRun.findFirst({ where: { reversalOfRunId: runId } })).toMatchObject({ notes: 'Wrong usage', status: 'POSTED' });
    const history = await api('get', `/assets/${signId}/depreciation`);
    expect(history.body.entries.map((e: { runStatus: string; charge: string }) => [e.runStatus, e.charge])).toEqual([['REVERSED', '11.9'], ['REVERSAL', '-11.9']]);
    expect(history.body).toMatchObject({ accumulated: '0.00', carryingAmount: null });
    // Run again, with the right usage.
    await api('put', `/periods/${october}/usage/${pumpId}`).send({ units: 1000 });
    const again = await api('post', `/periods/${october}/runs`);
    await work(again.body.id);
    await api('post', `/runs/${again.body.id}/post`, approver());
    await work(again.body.id);
    expect((await prisma.depreciationRun.findUniqueOrThrow({ where: { id: again.body.id } })).totalCharge.toFixed(2)).toBe('61.90');
    const after = await api('get', `/assets/${signId}/depreciation`);
    expect(after.body).toMatchObject({ accumulated: '11.90', carryingAmount: '988.10' });
  });

  it('keeps runs in month order and the poster apart from the preparer in the database too', async () => {
    const september = await openPeriod(2026, 9);
    expect((await api('post', `/periods/${september}/runs`)).body.code).toBe('LATER_PERIOD_POSTED');
    const run = await prisma.depreciationRun.findFirstOrThrow({ where: { tenantId: TID, status: 'POSTED', reversalOfRunId: null } });
    await expect(prisma.depreciationRun.update({ where: { id: run.id }, data: { postedBy: run.preparedBy } })).rejects.toThrow(/separate_poster/);
  });

  it('discards a draft, and a new draft replaces an older one', async () => {
    const december = await openPeriod(2026, 12);
    const first = await api('post', `/periods/${december}/runs`);
    expect((await api('post', `/periods/${december}/runs`)).body.code).toBe('RUN_BUSY'); // the worker has not got to it yet
    await work(first.body.id);
    const second = await api('post', `/periods/${december}/runs`);
    await work(second.body.id);
    expect((await prisma.depreciationRun.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe('DISCARDED');
    expect((await api('post', `/runs/${second.body.id}/discard`)).body.status).toBe('DISCARDED');
    expect((await api('post', `/runs/${second.body.id}/post`, approver())).body.code).toBe('NOT_DRAFT');
  });

  it('needs accounting:approve to post, reverse, reopen or lock', async () => {
    const run = await prisma.depreciationRun.findFirstOrThrow({ where: { tenantId: TID, status: 'POSTED', reversalOfRunId: null } });
    expect((await api('post', `/runs/${run.id}/reverse`)).status).toBe(403);
    expect((await api('post', `/periods/${run.periodId}/lock`)).status).toBe(403);
  });
});

describe('worker (stage 2.10)', () => {
  it('records a refused post as FAILED with the reason, and leaves the run a draft', async () => {
    const january = await openPeriod(2027, 1);
    const run = (await api('post', `/periods/${january}/runs`)).body.id;
    await work(run);
    expect((await api('post', `/runs/${run}/post`, approver())).status).toBe(202);
    // The month is closed by hand before the worker gets to the post.
    await prisma.accountingPeriod.update({ where: { id: january }, data: { status: 'CLOSED' } });
    await work(run);
    expect(await prisma.depreciationRun.findUniqueOrThrow({ where: { id: run } })).toMatchObject({
      status: 'DRAFT', jobState: 'FAILED', jobError: 'The period is not open', pendingAction: null,
    });
    expect(await prisma.depreciationEntry.count({ where: { runId: run } })).toBe(0);
  });

  it('does nothing for a run with nothing queued', async () => {
    const done = await prisma.depreciationRun.findFirstOrThrow({ where: { tenantId: TID, jobState: 'DONE', status: 'POSTED' } });
    await work(done.id);
    expect((await prisma.depreciationRun.findUniqueOrThrow({ where: { id: done.id } })).updatedAt).toEqual(done.updatedAt);
  });
});

describe('bulk usage (stage 2.10)', () => {
  it('lists the units-of-production assets and saves their usage together', async () => {
    const february = await openPeriod(2027, 2);
    const list = await api('get', `/periods/${february}/usage`);
    expect(list.body.map((a: { id: string; units: unknown }) => [a.id, a.units])).toEqual([[pumpId, null]]);
    const saved = await api('put', `/periods/${february}/usage`).send({ rows: [{ assetId: pumpId, units: 750 }] });
    expect(saved.status).toBe(200);
    expect((await api('get', `/periods/${february}/usage`)).body[0].units).toBe('750');
  });

  it('refuses the whole list for an unknown asset, a repeat or a closed period', async () => {
    const february = (await prisma.accountingPeriod.findFirstOrThrow({ where: { tenantId: TID, year: 2027, month: 2 } })).id;
    expect((await api('put', `/periods/${february}/usage`).send({ rows: [{ assetId: pumpId, units: 1 }, { assetId: 'nope', units: 1 }] })).status).toBe(404);
    expect((await api('put', `/periods/${february}/usage`).send({ rows: [{ assetId: pumpId, units: 1 }, { assetId: pumpId, units: 2 }] })).status).toBe(400);
    expect((await api('get', `/periods/${february}/usage`)).body[0].units).toBe('750');
    const january = (await prisma.accountingPeriod.findFirstOrThrow({ where: { tenantId: TID, year: 2027, month: 1 } })).id;
    expect((await api('put', `/periods/${january}/usage`).send({ rows: [{ assetId: pumpId, units: 1 }] })).body.code).toBe('PERIOD_NOT_OPEN');
  });
});
