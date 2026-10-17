import { Prisma } from '@prisma/client';

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { money, sumMoney, ZERO, type Money } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { recordAuditEvent } from '../audit-event.service';

import { chargeFor, ledgerState, type Charge, type Skip } from './engine';

// Accounting periods and depreciation runs (Phase 2, S2.3, D15, D17).
//
// A period is OPEN, CLOSED (no runs; an approver may reopen it) or LOCKED
// (final). One posted run per period. A run is prepared as a DRAFT with a
// preview; a different user posts it, which writes its entries and closes
// the period. A posted run is corrected by reversing it: offsetting entries in
// a reversal run, the original marked REVERSED. Runs go in month order: a
// period cannot be run or reversed while a later one has a posted run.
// The work runs in the API, not the worker, while volumes allow (plan §2.5).

type Tx = Prisma.TransactionClient;
const db = (tx?: Tx) => tx ?? prisma;

const effective = { status: 'POSTED' as const, reversalOfRunId: null };

async function findPeriod(tenantId: string, periodId: string, tx?: Tx) {
  const period = await db(tx).accountingPeriod.findFirst({ where: { id: periodId, tenantId } });
  if (!period) throw new NotFoundError('Accounting period not found');
  return period;
}

async function tenantTimeZone(tenantId: string) {
  return (await prisma.company.findUnique({ where: { tenantId }, select: { timezone: true } }))?.timezone ?? 'UTC';
}

/** Refuses when a later period already has a posted run: runs go in month order. */
async function assertNoLaterPosting(tenantId: string, period: { year: number; month: number }, tx?: Tx) {
  const later = await db(tx).depreciationRun.findFirst({
    where: { tenantId, ...effective, period: { OR: [{ year: { gt: period.year } }, { year: period.year, month: { gt: period.month } }] } },
    include: { period: true },
  });
  if (later) throw new ConflictError(`${later.period.year}-${String(later.period.month).padStart(2, '0')} is already posted; runs go in month order`, 'LATER_PERIOD_POSTED');
}

export async function listPeriods(tenantId: string) {
  return prisma.accountingPeriod.findMany({
    where: { tenantId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { runs: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, assetCount: true, totalCharge: true, preparedBy: true, postedBy: true, postedAt: true, reversalOfRunId: true, createdAt: true } } },
  });
}

export async function openPeriod(tenantId: string, actorId: string, year: number, month: number) {
  const existing = await prisma.accountingPeriod.findUnique({ where: { tenantId_year_month: { tenantId, year, month } } });
  if (existing) return existing;
  const period = await prisma.accountingPeriod.create({ data: { tenantId, year, month } });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'accounting_period', entityId: period.id, action: 'opened', after: { year, month } });
  return period;
}

/** Every asset's charge for the period from the ledger as it stands. */
async function computeCharges(tenantId: string, period: { id: string; year: number; month: number }, tx?: Tx) {
  const [assets, posted, usage, timeZone] = await Promise.all([
    db(tx).asset.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, depreciationMethod: true, recognitionStatus: true, capitalisedCost: true, residualValue: true,
        purchaseCost: true, freightCost: true, installationCost: true, customsDuties: true, otherCapitalizedCosts: true,
        usefulLifeMonths: true, depreciationStartDate: true, reducingBalanceRatePct: true, expectedTotalUnits: true,
        assetClass: { select: { code: true } }, disposal: { select: { disposalDate: true } },
      },
    }),
    db(tx).depreciationEntry.findMany({ where: { tenantId, run: effective }, select: { assetId: true, charge: true } }),
    db(tx).assetUsage.findMany({ where: { tenantId, periodId: period.id }, select: { assetId: true, units: true } }),
    tenantTimeZone(tenantId),
  ]);
  const byAsset = new Map<string, Prisma.Decimal[]>();
  for (const e of posted) byAsset.set(e.assetId, [...(byAsset.get(e.assetId) ?? []), e.charge]);
  const units = new Map(usage.map((u) => [u.assetId, u.units]));
  return assets.map((a) => ({
    assetId: a.id,
    classCode: a.assetClass?.code ?? null,
    result: chargeFor({
      method: a.depreciationMethod, recognitionStatus: a.recognitionStatus, capitalisedCost: a.capitalisedCost,
      costParts: [a.purchaseCost, a.freightCost, a.installationCost, a.customsDuties, a.otherCapitalizedCosts],
      residualValue: a.residualValue, usefulLifeMonths: a.usefulLifeMonths, depreciationStartDate: a.depreciationStartDate,
      disposalDate: a.disposal?.disposalDate ?? null, reducingBalanceRatePct: a.reducingBalanceRatePct, expectedTotalUnits: a.expectedTotalUnits,
    }, period, ledgerState(byAsset.get(a.id) ?? []), timeZone, units.get(a.id)) as Charge,
  }));
}

type Computed = Awaited<ReturnType<typeof computeCharges>>;

/** Count and charge in total and by class, and why assets were left out. */
function preview(charges: Computed) {
  const posted = charges.filter((c) => c.result.ok);
  const byClass = new Map<string, { count: number; charge: Money }>();
  const skipped: Partial<Record<Skip, number>> = {};
  for (const c of charges) {
    if (c.result.ok) {
      const k = c.classCode ?? '—';
      const g = byClass.get(k) ?? { count: 0, charge: ZERO };
      byClass.set(k, { count: g.count + 1, charge: g.charge.plus(c.result.charge) });
    } else {
      skipped[c.result.skip] = (skipped[c.result.skip] ?? 0) + 1;
    }
  }
  const total = sumMoney(posted.map((c) => (c.result.ok ? c.result.charge : ZERO)));
  return {
    assetCount: posted.length,
    totalCharge: total,
    json: {
      assetCount: posted.length,
      totalCharge: total.toFixed(2),
      byClass: [...byClass.entries()].sort().map(([classCode, g]) => ({ classCode, count: g.count, charge: g.charge.toFixed(2) })),
      skipped,
    },
  };
}

/** Prepares a DRAFT run with its preview; an earlier draft for the period is discarded. */
export async function prepareRun(tenantId: string, actorId: string, periodId: string) {
  const period = await findPeriod(tenantId, periodId);
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  if (await prisma.depreciationRun.count({ where: { tenantId, periodId, ...effective } })) {
    throw new ConflictError('The period already has a posted run; reverse it to run again', 'ALREADY_POSTED');
  }
  await assertNoLaterPosting(tenantId, period);
  const p = preview(await computeCharges(tenantId, period));
  await prisma.depreciationRun.updateMany({ where: { tenantId, periodId, status: 'DRAFT' }, data: { status: 'DISCARDED' } });
  return prisma.depreciationRun.create({
    data: { tenantId, periodId, preparedBy: actorId, preview: p.json, assetCount: p.assetCount, totalCharge: p.totalCharge },
  });
}

export async function discardRun(tenantId: string, runId: string) {
  const run = await prisma.depreciationRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) throw new NotFoundError('Run not found');
  if (run.status !== 'DRAFT') throw new ConflictError('Only a draft run can be discarded', 'NOT_DRAFT');
  return prisma.depreciationRun.update({ where: { id: runId }, data: { status: 'DISCARDED' } });
}

/**
 * Posts a DRAFT run: the charges are computed again from the ledger as it
 * stands, written as entries, and the period closed. The preparer cannot post.
 */
export async function postRun(tenantId: string, actorId: string, runId: string) {
  const posted = await prisma.$transaction(async (tx) => {
    const run = await tx.depreciationRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundError('Run not found');
    if (run.status !== 'DRAFT') throw new ConflictError('Only a draft run can be posted', 'NOT_DRAFT');
    if (run.preparedBy === actorId) throw new ForbiddenError('The person who prepared a run cannot post it (D17)');
    const period = await findPeriod(tenantId, run.periodId, tx);
    if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
    if (await tx.depreciationRun.count({ where: { tenantId, periodId: period.id, ...effective } })) {
      throw new ConflictError('The period already has a posted run', 'ALREADY_POSTED');
    }
    await assertNoLaterPosting(tenantId, period, tx);
    const charges = await computeCharges(tenantId, period, tx);
    const p = preview(charges);
    await tx.depreciationEntry.createMany({
      data: charges.flatMap((c) => (c.result.ok ? [{
        tenantId, assetId: c.assetId, periodId: period.id, runId, method: c.result.method,
        openingNbv: c.result.openingNbv, charge: c.result.charge, closingNbv: c.result.closingNbv, accumulated: c.result.accumulated,
      }] : [])),
    });
    await tx.accountingPeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedBy: actorId, closedAt: new Date() } });
    return tx.depreciationRun.update({
      where: { id: runId },
      data: { status: 'POSTED', postedBy: actorId, postedAt: new Date(), preview: p.json, assetCount: p.assetCount, totalCharge: p.totalCharge },
    });
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'depreciation_run', entityId: runId, action: 'posted', after: { assetCount: posted.assetCount, totalCharge: posted.totalCharge.toFixed(2) } });
  return posted;
}

/** Reverses a posted run with offsetting entries; the period must not be locked. */
export async function reverseRun(tenantId: string, actorId: string, runId: string, notes?: string) {
  const reversal = await prisma.$transaction(async (tx) => {
    const run = await tx.depreciationRun.findFirst({ where: { id: runId, tenantId }, include: { entries: true } });
    if (!run) throw new NotFoundError('Run not found');
    if (run.status !== 'POSTED' || run.reversalOfRunId) throw new ConflictError('Only a posted run can be reversed', 'NOT_POSTED');
    const period = await findPeriod(tenantId, run.periodId, tx);
    if (period.status === 'LOCKED') throw new ConflictError('The period is locked', 'PERIOD_LOCKED');
    await assertNoLaterPosting(tenantId, period, tx);
    const created = await tx.depreciationRun.create({
      data: {
        tenantId, periodId: period.id, status: 'POSTED', preparedBy: actorId, reversalOfRunId: run.id, notes,
        assetCount: run.assetCount, totalCharge: run.totalCharge.negated(),
      },
    });
    await tx.depreciationEntry.createMany({
      data: run.entries.map((e) => ({
        tenantId, assetId: e.assetId, periodId: period.id, runId: created.id, method: e.method,
        openingNbv: e.closingNbv, charge: e.charge.negated(), closingNbv: e.openingNbv, accumulated: e.accumulated.minus(e.charge),
      })),
    });
    await tx.depreciationRun.update({ where: { id: run.id }, data: { status: 'REVERSED', reversedBy: actorId, reversedAt: new Date() } });
    return created;
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'depreciation_run', entityId: runId, action: 'reversed', after: { reversalRunId: reversal.id, notes: notes ?? null } });
  return reversal;
}

/** CLOSED → OPEN (to run again after a reversal), OPEN or CLOSED → LOCKED (final). */
export async function setPeriodStatus(tenantId: string, actorId: string, periodId: string, to: 'OPEN' | 'LOCKED') {
  const period = await findPeriod(tenantId, periodId);
  if (period.status === 'LOCKED') throw new ConflictError('A locked period cannot change', 'PERIOD_LOCKED');
  if (to === 'OPEN' && period.status !== 'CLOSED') throw new ConflictError('Only a closed period can be reopened', 'NOT_CLOSED');
  if (to === 'LOCKED' && (await prisma.depreciationRun.count({ where: { tenantId, periodId, status: 'DRAFT' } }))) {
    throw new ConflictError('Discard or post the draft run first', 'DRAFT_PENDING');
  }
  const data = to === 'LOCKED' ? { status: to, lockedBy: actorId, lockedAt: new Date() } : { status: to };
  const updated = await prisma.accountingPeriod.update({ where: { id: periodId }, data });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'accounting_period', entityId: periodId, action: to === 'LOCKED' ? 'locked' : 'reopened', before: { status: period.status }, after: { status: to } });
  return updated;
}

/** Units an asset delivered in an open period, for units of production (D21). */
export async function setUsage(tenantId: string, actorId: string, periodId: string, assetId: string, units: number) {
  const period = await findPeriod(tenantId, periodId);
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  if (!(await prisma.asset.findFirst({ where: { id: assetId, tenantId, deletedAt: null } }))) throw new NotFoundError('Asset not found');
  if (!Number.isFinite(units) || units < 0) throw new ValidationError('units must be zero or more');
  return prisma.assetUsage.upsert({
    where: { assetId_periodId: { assetId, periodId } },
    update: { units, enteredBy: actorId },
    create: { tenantId, assetId, periodId, units, enteredBy: actorId },
  });
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
