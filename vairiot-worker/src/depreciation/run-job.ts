import type { Prisma, PrismaClient } from '@prisma/client';
import { chargeFor, ledgerState, ZERO, type Charge, type Money, type Skip } from 'vairiot-shared';

// Depreciation runs, worked by the worker (Phase 2, S2.3, stage 2.10). The API
// checks a request against the period and the run and records it on the run
// (`pendingAction`, `pendingBy`); this does the work and records the outcome:
// - PREPARE: the preview (count, charge by class, why assets were left out);
// - POST: charges computed again from the ledger as it stands, written as
//   append-only entries, the run POSTED and the period closed;
// - REVERSE: a reversal run with offsetting entries, the original REVERSED.
// Everything the API checked is checked again inside the transaction, since
// the ledger may have moved while the job waited. Takes the client as a
// parameter so the API's tests can run it against their own database.

type Db = PrismaClient | Prisma.TransactionClient;
const effective = { status: 'POSTED' as const, reversalOfRunId: null };

export class RunRefused extends Error {}

async function computeCharges(db: Db, tenantId: string, period: { id: string; year: number; month: number }) {
  const [assets, posted, usage, company] = await Promise.all([
    db.asset.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, depreciationMethod: true, recognitionStatus: true, capitalisedCost: true, residualValue: true,
        purchaseCost: true, freightCost: true, installationCost: true, customsDuties: true, otherCapitalizedCosts: true,
        usefulLifeMonths: true, depreciationStartDate: true, reducingBalanceRatePct: true, expectedTotalUnits: true,
        assetClass: { select: { code: true } }, disposal: { select: { disposalDate: true } },
      },
    }),
    db.depreciationEntry.findMany({ where: { tenantId, run: effective }, select: { assetId: true, charge: true } }),
    db.assetUsage.findMany({ where: { tenantId, periodId: period.id }, select: { assetId: true, units: true } }),
    db.company.findUnique({ where: { tenantId }, select: { timezone: true } }),
  ]);
  const timeZone = company?.timezone ?? 'UTC';
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

function preview(charges: Awaited<ReturnType<typeof computeCharges>>) {
  const byClass = new Map<string, { count: number; charge: Money }>();
  const skipped: Partial<Record<Skip, number>> = {};
  let total = ZERO;
  let count = 0;
  for (const c of charges) {
    if (c.result.ok) {
      count += 1;
      total = total.plus(c.result.charge);
      const k = c.classCode ?? '—';
      const g = byClass.get(k) ?? { count: 0, charge: ZERO };
      byClass.set(k, { count: g.count + 1, charge: g.charge.plus(c.result.charge) });
    } else {
      skipped[c.result.skip] = (skipped[c.result.skip] ?? 0) + 1;
    }
  }
  return {
    assetCount: count,
    totalCharge: total.toFixed(2),
    json: {
      assetCount: count, totalCharge: total.toFixed(2),
      byClass: [...byClass.entries()].sort().map(([classCode, g]) => ({ classCode, count: g.count, charge: g.charge.toFixed(2) })),
      skipped,
    },
  };
}

/** Refuses when a later period has a posted run: runs go in month order. */
async function assertInOrder(db: Db, tenantId: string, period: { year: number; month: number }) {
  const later = await db.depreciationRun.count({
    where: { tenantId, ...effective, period: { OR: [{ year: { gt: period.year } }, { year: period.year, month: { gt: period.month } }] } },
  });
  if (later) throw new RunRefused('A later period is already posted; runs go in month order');
}

const audit = (db: Db, tenantId: string, actorId: string | null, entityId: string, action: string, after: Prisma.InputJsonValue) =>
  db.auditEvent.create({ data: { tenantId, actorId, entityType: 'depreciation_run', entityId, action, after } });

async function prepare(db: PrismaClient, run: { id: string; tenantId: string; periodId: string }) {
  const period = await db.accountingPeriod.findUniqueOrThrow({ where: { id: run.periodId } });
  const p = preview(await computeCharges(db, run.tenantId, period));
  await db.depreciationRun.update({ where: { id: run.id }, data: { preview: p.json, assetCount: p.assetCount, totalCharge: p.totalCharge } });
}

async function post(db: PrismaClient, run: { id: string; tenantId: string; periodId: string; preparedBy: string; pendingBy: string | null }) {
  const poster = run.pendingBy!;
  if (poster === run.preparedBy) throw new RunRefused('The person who prepared a run cannot post it (D17)');
  await db.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUniqueOrThrow({ where: { id: run.periodId } });
    if (period.status !== 'OPEN') throw new RunRefused('The period is not open');
    if (await tx.depreciationRun.count({ where: { tenantId: run.tenantId, periodId: period.id, ...effective } })) throw new RunRefused('The period already has a posted run');
    await assertInOrder(tx, run.tenantId, period);
    const charges = await computeCharges(tx, run.tenantId, period);
    const p = preview(charges);
    await tx.depreciationEntry.createMany({
      data: charges.flatMap((c) => (c.result.ok ? [{
        tenantId: run.tenantId, assetId: c.assetId, periodId: period.id, runId: run.id, method: c.result.method,
        openingNbv: c.result.openingNbv.toFixed(2), charge: c.result.charge.toFixed(2),
        closingNbv: c.result.closingNbv.toFixed(2), accumulated: c.result.accumulated.toFixed(2),
      }] : [])),
    });
    await tx.accountingPeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedBy: poster, closedAt: new Date() } });
    await tx.depreciationRun.update({
      where: { id: run.id },
      data: { status: 'POSTED', postedBy: poster, postedAt: new Date(), preview: p.json, assetCount: p.assetCount, totalCharge: p.totalCharge },
    });
    await audit(tx, run.tenantId, poster, run.id, 'posted', { assetCount: p.assetCount, totalCharge: p.totalCharge });
  });
}

async function reverse(db: PrismaClient, run: { id: string; tenantId: string; periodId: string; pendingBy: string | null; pendingNotes: string | null }) {
  const reverser = run.pendingBy!;
  await db.$transaction(async (tx) => {
    const original = await tx.depreciationRun.findUniqueOrThrow({ where: { id: run.id }, include: { entries: true } });
    if (original.status !== 'POSTED' || original.reversalOfRunId) throw new RunRefused('Only a posted run can be reversed');
    const period = await tx.accountingPeriod.findUniqueOrThrow({ where: { id: run.periodId } });
    if (period.status === 'LOCKED') throw new RunRefused('The period is locked');
    await assertInOrder(tx, run.tenantId, period);
    const created = await tx.depreciationRun.create({
      data: {
        tenantId: run.tenantId, periodId: period.id, status: 'POSTED', jobState: 'DONE', preparedBy: reverser, reversalOfRunId: original.id,
        notes: run.pendingNotes, assetCount: original.assetCount, totalCharge: original.totalCharge.negated(),
      },
    });
    await tx.depreciationEntry.createMany({
      data: original.entries.map((e) => ({
        tenantId: run.tenantId, assetId: e.assetId, periodId: period.id, runId: created.id, method: e.method,
        openingNbv: e.closingNbv, charge: e.charge.negated(), closingNbv: e.openingNbv, accumulated: e.accumulated.minus(e.charge),
      })),
    });
    await tx.depreciationRun.update({ where: { id: original.id }, data: { status: 'REVERSED', reversedBy: reverser, reversedAt: new Date() } });
    await audit(tx, run.tenantId, reverser, original.id, 'reversed', { reversalRunId: created.id, notes: run.pendingNotes });
  });
}

/**
 * Works the run's pending action and records the outcome on the run: DONE, or
 * FAILED with the reason (a refused action leaves the run as it was).
 */
export async function processDepreciationRun(db: PrismaClient, job: { tenantId: string; runId: string }): Promise<void> {
  const run = await db.depreciationRun.findFirst({ where: { id: job.runId, tenantId: job.tenantId } });
  if (!run || !run.pendingAction || run.jobState === 'DONE') return;
  await db.depreciationRun.update({ where: { id: run.id }, data: { jobState: 'RUNNING' } });
  try {
    if (run.pendingAction === 'PREPARE') await prepare(db, run);
    else if (run.pendingAction === 'POST') await post(db, run);
    else await reverse(db, run);
    await db.depreciationRun.update({ where: { id: run.id }, data: { jobState: 'DONE', pendingAction: null, pendingBy: null, pendingNotes: null, jobError: null } });
  } catch (err) {
    await db.depreciationRun.update({
      where: { id: run.id },
      data: { jobState: 'FAILED', pendingAction: null, pendingBy: null, pendingNotes: null, jobError: (err as Error).message.slice(0, 500) },
    });
    if (!(err instanceof RunRefused)) throw err;
  }
}
