import { Prisma } from '@prisma/client';

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { money, sumMoney } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { enqueueDepreciationRun } from '../../lib/queue';
import { recordAuditEvent } from '../audit-event.service';

// Accounting periods and depreciation runs (Phase 2, S2.3, D15, D17).
//
// A period is OPEN, CLOSED (no runs; an approver may reopen it) or LOCKED
// (final). One posted run per period, in month order. Since stage 2.10 the
// worker does the work: the API checks a request here, records it on the run
// (`pendingAction`, `pendingBy`, `jobState: QUEUED`) and queues it; the worker
// prepares the preview, posts the entries or writes the reversal, checking
// again inside its transaction, and records DONE or FAILED with the reason.
// One action in flight per period (a partial unique index).

const effective = { status: 'POSTED' as const, reversalOfRunId: null };
const busy = { jobState: { in: ['QUEUED' as const, 'RUNNING' as const] } };

async function findPeriod(tenantId: string, periodId: string) {
  const period = await prisma.accountingPeriod.findFirst({ where: { id: periodId, tenantId } });
  if (!period) throw new NotFoundError('Accounting period not found');
  return period;
}

async function findRun(tenantId: string, runId: string) {
  const run = await prisma.depreciationRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) throw new NotFoundError('Run not found');
  return run;
}

/** Refuses when a later period already has a posted run: runs go in month order. */
async function assertNoLaterPosting(tenantId: string, period: { year: number; month: number }) {
  const later = await prisma.depreciationRun.findFirst({
    where: { tenantId, ...effective, period: { OR: [{ year: { gt: period.year } }, { year: period.year, month: { gt: period.month } }] } },
    include: { period: true },
  });
  if (later) throw new ConflictError(`${later.period.year}-${String(later.period.month).padStart(2, '0')} is already posted; runs go in month order`, 'LATER_PERIOD_POSTED');
}

async function assertIdle(tenantId: string, periodId: string) {
  if (await prisma.depreciationRun.count({ where: { tenantId, periodId, ...busy } })) {
    throw new ConflictError('The worker is still on a run for this period', 'RUN_BUSY');
  }
}

/** Queues the run; a second action on the same period at once is refused by the index. */
async function queue(tenantId: string, runId: string) {
  await enqueueDepreciationRun({ tenantId, runId });
}

const busyConflict = (err: unknown): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError('The worker is still on a run for this period', 'RUN_BUSY');
  }
  throw err;
};

export async function listPeriods(tenantId: string) {
  return prisma.accountingPeriod.findMany({
    where: { tenantId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, assetCount: true, totalCharge: true, preview: true, preparedBy: true, postedBy: true, postedAt: true,
          reversalOfRunId: true, createdAt: true, jobState: true, pendingAction: true, jobError: true,
        },
      },
    },
  });
}

export async function openPeriod(tenantId: string, actorId: string, year: number, month: number) {
  const existing = await prisma.accountingPeriod.findUnique({ where: { tenantId_year_month: { tenantId, year, month } } });
  if (existing) return existing;
  const period = await prisma.accountingPeriod.create({ data: { tenantId, year, month } });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'accounting_period', entityId: period.id, action: 'opened', after: { year, month } });
  return period;
}

/** Queues a DRAFT run for the worker to preview; an earlier draft for the period is discarded. */
export async function prepareRun(tenantId: string, actorId: string, periodId: string) {
  const period = await findPeriod(tenantId, periodId);
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  if (await prisma.depreciationRun.count({ where: { tenantId, periodId, ...effective } })) {
    throw new ConflictError('The period already has a posted run; reverse it to run again', 'ALREADY_POSTED');
  }
  await assertNoLaterPosting(tenantId, period);
  await assertIdle(tenantId, periodId);
  await prisma.depreciationRun.updateMany({ where: { tenantId, periodId, status: 'DRAFT' }, data: { status: 'DISCARDED' } });
  const run = await prisma.depreciationRun.create({
    data: { tenantId, periodId, preparedBy: actorId, jobState: 'QUEUED', pendingAction: 'PREPARE', pendingBy: actorId },
  }).catch(busyConflict);
  await queue(tenantId, run.id);
  return run;
}

export async function discardRun(tenantId: string, runId: string) {
  const run = await findRun(tenantId, runId);
  if (run.status !== 'DRAFT') throw new ConflictError('Only a draft run can be discarded', 'NOT_DRAFT');
  if (run.jobState === 'QUEUED' || run.jobState === 'RUNNING') throw new ConflictError('The worker is still on this run', 'RUN_BUSY');
  return prisma.depreciationRun.update({ where: { id: runId }, data: { status: 'DISCARDED' } });
}

/** Queues a DRAFT run for posting by someone other than its preparer (D17). */
export async function postRun(tenantId: string, actorId: string, runId: string) {
  const run = await findRun(tenantId, runId);
  if (run.status !== 'DRAFT') throw new ConflictError('Only a draft run can be posted', 'NOT_DRAFT');
  if (run.jobState !== 'DONE' && run.jobState !== 'FAILED') throw new ConflictError('The run is still being prepared', 'RUN_BUSY');
  if (run.preparedBy === actorId) throw new ForbiddenError('The person who prepared a run cannot post it (D17)');
  const period = await findPeriod(tenantId, run.periodId);
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  if (await prisma.depreciationRun.count({ where: { tenantId, periodId: period.id, ...effective } })) {
    throw new ConflictError('The period already has a posted run', 'ALREADY_POSTED');
  }
  await assertNoLaterPosting(tenantId, period);
  const queued = await prisma.depreciationRun.update({
    where: { id: runId }, data: { jobState: 'QUEUED', pendingAction: 'POST', pendingBy: actorId, jobError: null },
  }).catch(busyConflict);
  await queue(tenantId, runId);
  return queued;
}

/** Queues the reversal of a posted run; the period must not be locked. */
export async function reverseRun(tenantId: string, actorId: string, runId: string, notes?: string) {
  const run = await findRun(tenantId, runId);
  if (run.status !== 'POSTED' || run.reversalOfRunId) throw new ConflictError('Only a posted run can be reversed', 'NOT_POSTED');
  const period = await findPeriod(tenantId, run.periodId);
  if (period.status === 'LOCKED') throw new ConflictError('The period is locked', 'PERIOD_LOCKED');
  await assertNoLaterPosting(tenantId, period);
  await assertIdle(tenantId, period.id);
  const queued = await prisma.depreciationRun.update({
    where: { id: runId }, data: { jobState: 'QUEUED', pendingAction: 'REVERSE', pendingBy: actorId, pendingNotes: notes ?? null, jobError: null },
  }).catch(busyConflict);
  await queue(tenantId, runId);
  return queued;
}

/** CLOSED → OPEN (to run again after a reversal), OPEN or CLOSED → LOCKED (final). */
export async function setPeriodStatus(tenantId: string, actorId: string, periodId: string, to: 'OPEN' | 'LOCKED') {
  const period = await findPeriod(tenantId, periodId);
  if (period.status === 'LOCKED') throw new ConflictError('A locked period cannot change', 'PERIOD_LOCKED');
  if (to === 'OPEN' && period.status !== 'CLOSED') throw new ConflictError('Only a closed period can be reopened', 'NOT_CLOSED');
  if (to === 'LOCKED' && (await prisma.depreciationRun.count({ where: { tenantId, periodId, OR: [{ status: 'DRAFT' }, busy] } }))) {
    throw new ConflictError('Discard or post the draft run first', 'DRAFT_PENDING');
  }
  const data = to === 'LOCKED' ? { status: to, lockedBy: actorId, lockedAt: new Date() } : { status: to };
  const updated = await prisma.accountingPeriod.update({ where: { id: periodId }, data });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'accounting_period', entityId: periodId, action: to === 'LOCKED' ? 'locked' : 'reopened', before: { status: period.status }, after: { status: to } });
  return updated;
}

/** Units an asset delivered in an open period, for units of production (D21). */
export async function setUsage(tenantId: string, actorId: string, periodId: string, assetId: string, units: number) {
  return (await setUsageBulk(tenantId, actorId, periodId, [{ assetId, units }]))[0];
}

/**
 * Units for many assets in an open period at once (stage 2.10, the bulk
 * usage screen). All or nothing: an unknown asset refuses the whole list.
 */
export async function setUsageBulk(tenantId: string, actorId: string, periodId: string, rows: Array<{ assetId: string; units: number }>) {
  const period = await findPeriod(tenantId, periodId);
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  if (rows.some((r) => !Number.isFinite(r.units) || r.units < 0)) throw new ValidationError('units must be zero or more');
  const ids = [...new Set(rows.map((r) => r.assetId))];
  if (ids.length !== rows.length) throw new ValidationError('Each asset may appear once');
  const found = await prisma.asset.count({ where: { tenantId, id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw new NotFoundError('Asset not found');
  return prisma.$transaction(rows.map((r) => prisma.assetUsage.upsert({
    where: { assetId_periodId: { assetId: r.assetId, periodId } },
    update: { units: r.units, enteredBy: actorId },
    create: { tenantId, assetId: r.assetId, periodId, units: r.units, enteredBy: actorId },
  })));
}

/** The units-of-production assets with their usage for a period, for the bulk screen. */
export async function listUsage(tenantId: string, periodId: string) {
  await findPeriod(tenantId, periodId);
  const assets = await prisma.asset.findMany({
    where: { tenantId, deletedAt: null, depreciationMethod: 'units_of_production', status: { not: 'disposed' } },
    select: { id: true, assetNumber: true, name: true, expectedTotalUnits: true, usage: { where: { periodId }, select: { units: true } } },
    orderBy: { assetNumber: 'asc' },
  });
  return assets.map(({ usage, ...a }) => ({ ...a, units: usage[0]?.units ?? null }));
}

/** An asset's posted depreciation, oldest first, with its carrying amount from the ledger. */
export async function assetDepreciationHistory(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId } });
  if (!asset) throw new NotFoundError('Asset not found');
  const entries = await prisma.depreciationEntry.findMany({
    where: { tenantId, assetId },
    include: { period: { select: { year: true, month: true } }, run: { select: { status: true, reversalOfRunId: true } } },
    orderBy: [{ period: { year: 'asc' } }, { period: { month: 'asc' } }, { createdAt: 'asc' }],
  });
  const counted = entries.filter((e) => e.run.status === 'POSTED' && !e.run.reversalOfRunId);
  const accumulated = sumMoney(counted.map((e) => e.charge));
  const cost = asset.capitalisedCost ?? sumMoney([asset.purchaseCost, asset.freightCost, asset.installationCost, asset.customsDuties, asset.otherCapitalizedCosts]);
  return {
    entries: entries.map((e) => ({
      id: e.id, year: e.period.year, month: e.period.month, method: e.method, runStatus: e.run.reversalOfRunId ? 'REVERSAL' : e.run.status,
      openingNbv: e.openingNbv, charge: e.charge, closingNbv: e.closingNbv, accumulated: e.accumulated,
    })),
    accumulated: accumulated.toFixed(2),
    carryingAmount: counted.length ? money(cost).minus(accumulated).toFixed(2) : null,
  };
}
