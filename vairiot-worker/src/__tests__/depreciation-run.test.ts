import type { PrismaClient } from '@prisma/client';

import { processDepreciationRun } from '../depreciation/run-job';

// The worker's side of a depreciation run (stage 2.10), against a fake client;
// the API's tests run the same job against the database.

const PERIOD = { id: 'p10', tenantId: 't', year: 2026, month: 10, status: 'OPEN' };
const ASSETS = [
  {
    id: 'desk', depreciationMethod: 'straight_line', recognitionStatus: 'RECOGNISED', capitalisedCost: '1200', residualValue: null,
    purchaseCost: '1200', freightCost: null, installationCost: null, customsDuties: null, otherCapitalizedCosts: null,
    usefulLifeMonths: 120, depreciationStartDate: new Date('2026-09-10'), reducingBalanceRatePct: null, expectedTotalUnits: null,
    assetClass: { code: 'FUR' }, disposal: null,
  },
  { id: 'plant', depreciationStartDate: new Date('2026-01-10'), depreciationMethod: 'none', recognitionStatus: 'RECOGNISED', capitalisedCost: '50', assetClass: null, disposal: null },
];

function fakeDb(run: Record<string, unknown>, overrides: { count?: number } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    depreciationRun: {
      findFirst: jest.fn().mockResolvedValue(run),
      update: jest.fn(async ({ data }) => { updates.push(data); return run; }),
      count: jest.fn().mockResolvedValue(overrides.count ?? 0),
    },
    accountingPeriod: { findUniqueOrThrow: jest.fn().mockResolvedValue(PERIOD), update: jest.fn() },
    asset: { findMany: jest.fn().mockResolvedValue(ASSETS) },
    depreciationEntry: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    assetUsage: { findMany: jest.fn().mockResolvedValue([]) },
    company: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  return { db, updates, client: db as unknown as PrismaClient };
}

const base = { id: 'r1', tenantId: 't', periodId: 'p10', preparedBy: 'ann', jobState: 'QUEUED', pendingNotes: null };

it('prepares the preview: the charge by class and why assets were left out', async () => {
  const { client, updates } = fakeDb({ ...base, pendingAction: 'PREPARE', pendingBy: 'ann' });
  await processDepreciationRun(client, { tenantId: 't', runId: 'r1' });
  expect(updates[0]).toEqual({ jobState: 'RUNNING' });
  expect(updates[1]).toMatchObject({ assetCount: 1, totalCharge: '10.00', preview: { byClass: [{ classCode: 'FUR', count: 1, charge: '10.00' }], skipped: { no_method: 1 } } });
  expect(updates.at(-1)).toMatchObject({ jobState: 'DONE', pendingAction: null, jobError: null });
});

it('posts the entries, closes the month and records who posted it', async () => {
  const { client, db, updates } = fakeDb({ ...base, pendingAction: 'POST', pendingBy: 'bob' });
  await processDepreciationRun(client, { tenantId: 't', runId: 'r1' });
  expect(db.depreciationEntry.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ assetId: 'desk', charge: '10.00', closingNbv: '1190.00' })] });
  expect(db.accountingPeriod.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED', closedBy: 'bob' }) }));
  expect(updates).toContainEqual(expect.objectContaining({ status: 'POSTED', postedBy: 'bob' }));
  expect(db.auditEvent.create).toHaveBeenCalled();
  expect(updates.at(-1)).toMatchObject({ jobState: 'DONE' });
});

it('records a refusal as FAILED with the reason, without throwing', async () => {
  const { client, db, updates } = fakeDb({ ...base, pendingAction: 'POST', pendingBy: 'ann' });
  await processDepreciationRun(client, { tenantId: 't', runId: 'r1' });
  expect(db.depreciationEntry.createMany).not.toHaveBeenCalled();
  expect(updates.at(-1)).toMatchObject({ jobState: 'FAILED', jobError: 'The person who prepared a run cannot post it (D17)' });
});

it('refuses to post a month that already has a posted run', async () => {
  const { client, updates } = fakeDb({ ...base, pendingAction: 'POST', pendingBy: 'bob' }, { count: 1 });
  await processDepreciationRun(client, { tenantId: 't', runId: 'r1' });
  expect(updates.at(-1)).toMatchObject({ jobState: 'FAILED', jobError: 'The period already has a posted run' });
});

it('records an unexpected error and rethrows it so BullMQ logs the failure', async () => {
  const { client, db, updates } = fakeDb({ ...base, pendingAction: 'PREPARE', pendingBy: 'ann' });
  db.asset.findMany.mockRejectedValue(new Error('connection lost'));
  await expect(processDepreciationRun(client, { tenantId: 't', runId: 'r1' })).rejects.toThrow('connection lost');
  expect(updates.at(-1)).toMatchObject({ jobState: 'FAILED', jobError: 'connection lost' });
});

it('does nothing for a run with no pending action', async () => {
  const { client, updates } = fakeDb({ ...base, jobState: 'DONE', pendingAction: null });
  await processDepreciationRun(client, { tenantId: 't', runId: 'r1' });
  expect(updates).toEqual([]);
});
