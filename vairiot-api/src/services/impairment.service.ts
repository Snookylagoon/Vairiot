import { Prisma, type ImpairmentIndicator, type ImpairmentMethod, type ImpairmentStandard } from '@prisma/client';
import { costOf, unimpairedCarrying } from 'vairiot-shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { logger } from '../lib/logger';
import { minMoney, money, sumMoney, ZERO, type Money } from '../lib/money';
import { prisma } from '../lib/prisma';

import { recordAssetEvent } from './asset-event.service';
import { recordAuditEvent } from './audit-event.service';
import { getConditionScale } from './condition.service';
import { tenantFeatureEnabled } from './tenant-features.service';

// Impairment and its reversal (Phase 2, S2.4, stage 2.11; IPSAS 21 for
// non-cash-generating assets, IPSAS 26 for cash-generating ones).
//
// A DRAFT is raised from an indicator: by hand, or itself when an asset's
// grade drops to one whose scale entry has `impairmentIndicator`. Someone with
// accounting:write assesses it (the measurement method and the recoverable
// amount); someone else with accounting:approve posts it into an open period
// (D17). The figures are worked out again at posting, since a run may have
// posted in between:
// - recoverable below carrying: an IMPAIRMENT, loss = carrying − recoverable;
// - recoverable above carrying with impairment still on the asset: a REVERSAL,
//   capped at the impairment outstanding and at the carrying amount the asset
//   would have had with no impairment (IPSAS 21.68, 26.106); loss negative.
// Posting writes IMPAIRED on the asset ledger. The impairment takes effect at
// the start of the period it is posted into (whose run is not yet posted), so
// that period's run is the first on the lower base. A posted record is corrected by an offsetting one.

const counted = { status: { in: ['POSTED' as const, 'REVERSED' as const] } };
const effectiveRun = { status: 'POSTED' as const, reversalOfRunId: null };
const listInclude = {
  asset: { select: { id: true, assetNumber: true, name: true } },
  period: { select: { year: true, month: true } },
} satisfies Prisma.ImpairmentInclude;

async function findImpairment(tenantId: string, id: string) {
  const i = await prisma.impairment.findFirst({ where: { id, tenantId } });
  if (!i) throw new NotFoundError('Impairment not found');
  return i;
}

async function findAsset(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, tenantId, deletedAt: null },
    select: {
      id: true, status: true, recognitionStatus: true, depreciationMethod: true, capitalisedCost: true, residualValue: true,
      purchaseCost: true, freightCost: true, installationCost: true, customsDuties: true, otherCapitalizedCosts: true,
      usefulLifeMonths: true, depreciationStartDate: true, reducingBalanceRatePct: true, expectedTotalUnits: true,
    },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

type AssetRow = Awaited<ReturnType<typeof findAsset>>;

/** Carrying amount now, the impairment outstanding, and the carrying amount with none. */
export async function carryingFigures(tenantId: string, asset: AssetRow) {
  const [entries, impairments, company] = await Promise.all([
    prisma.depreciationEntry.findMany({
      where: { tenantId, assetId: asset.id, run: effectiveRun },
      select: { charge: true, periodId: true, period: { select: { year: true, month: true } } },
      orderBy: [{ period: { year: 'asc' } }, { period: { month: 'asc' } }],
    }),
    prisma.impairment.findMany({ where: { tenantId, assetId: asset.id, ...counted }, select: { loss: true } }),
    prisma.company.findUnique({ where: { tenantId }, select: { timezone: true } }),
  ]);
  const usage = await prisma.assetUsage.findMany({ where: { tenantId, assetId: asset.id }, select: { periodId: true, units: true } });
  const units = new Map(usage.map((u) => [u.periodId, u.units]));
  const engineAsset = {
    method: asset.depreciationMethod, recognitionStatus: asset.recognitionStatus, capitalisedCost: asset.capitalisedCost,
    costParts: [asset.purchaseCost, asset.freightCost, asset.installationCost, asset.customsDuties, asset.otherCapitalizedCosts],
    residualValue: asset.residualValue, usefulLifeMonths: asset.usefulLifeMonths, depreciationStartDate: asset.depreciationStartDate,
    reducingBalanceRatePct: asset.reducingBalanceRatePct, expectedTotalUnits: asset.expectedTotalUnits,
  };
  const cost = money(costOf(engineAsset).toFixed(2));
  const impaired = sumMoney(impairments.map((i) => i.loss));
  const carrying = cost.minus(sumMoney(entries.map((e) => e.charge))).minus(impaired);
  const unimpaired = money(unimpairedCarrying(
    engineAsset, entries.map((e) => ({ period: e.period, units: units.get(e.periodId) ?? undefined })), company?.timezone ?? 'UTC',
  ).toFixed(2));
  return { carrying, impaired, unimpaired };
}

/** What an assessment comes to: its kind and its loss (negative for a reversal). */
export function measure(f: { carrying: Money; impaired: Money; unimpaired: Money }, recoverable: Money) {
  if (recoverable.lessThan(f.carrying)) return { kind: 'IMPAIRMENT' as const, loss: f.carrying.minus(recoverable) };
  if (f.impaired.greaterThan(0) && recoverable.greaterThan(f.carrying)) {
    const cap = minMoney(minMoney(recoverable.minus(f.carrying), f.impaired), Prisma.Decimal.max(f.unimpaired.minus(f.carrying), ZERO));
    return { kind: 'REVERSAL' as const, loss: cap.negated() };
  }
  return { kind: 'IMPAIRMENT' as const, loss: ZERO };
}

export async function listImpairments(tenantId: string, filters: { status?: string; assetId?: string } = {}) {
  const status = ['DRAFT', 'POSTED', 'REVERSED', 'DISMISSED'].includes(filters.status ?? '') ? filters.status as 'DRAFT' : undefined;
  return prisma.impairment.findMany({
    where: { tenantId, ...(status && { status }), ...(filters.assetId && { assetId: filters.assetId }) },
    include: listInclude,
    orderBy: { createdAt: 'desc' },
  });
}

async function createDraft(tenantId: string, actorId: string | null, data: { assetId: string; indicator: ImpairmentIndicator; indicatorNotes?: string; conditionGrade?: number }) {
  try {
    return await prisma.impairment.create({ data: { tenantId, raisedBy: actorId, ...data } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('The asset already has an impairment waiting to be assessed', 'DRAFT_EXISTS');
    }
    throw err;
  }
}

/** Raises an indicator by hand. */
export async function raiseImpairment(tenantId: string, actorId: string, input: { assetId: string; indicator: ImpairmentIndicator; indicatorNotes?: string }) {
  const asset = await findAsset(tenantId, input.assetId);
  if (asset.recognitionStatus !== 'RECOGNISED') throw new ConflictError('Only a recognised asset can be impaired', 'NOT_RECOGNISED');
  const draft = await createDraft(tenantId, actorId, input);
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'impairment', entityId: draft.id, action: 'raised', after: { assetId: input.assetId, indicator: input.indicator } });
  return draft;
}

/**
 * A DRAFT when the grade drops to one that indicates impairment from one that
 * did not (S2.4 step 2). Quiet when the ledger is off, the asset is not
 * recognised or a draft is already waiting; never fails the asset's update.
 */
export async function raiseFromCondition(tenantId: string, assetId: string, actorId: string | null, from: number | null, to: number | null) {
  if (to === null || from === to) return;
  try {
    if (!(await tenantFeatureEnabled(tenantId, 'ipsas'))) return;
    const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId }, select: { recognitionStatus: true, categoryId: true } });
    if (asset?.recognitionStatus !== 'RECOGNISED') return;
    const scale = await getConditionScale(tenantId, asset.categoryId);
    const indicates = (g: number | null) => scale.entries.find((e) => e.grade === g)?.impairmentIndicator ?? false;
    if (!indicates(to) || indicates(from)) return;
    if (await prisma.impairment.count({ where: { tenantId, assetId, status: 'DRAFT' } })) return;
    const draft = await createDraft(tenantId, actorId, { assetId, indicator: 'CONDITION', conditionGrade: to, indicatorNotes: `Grade ${from ?? '—'} → ${to}` });
    recordAuditEvent({ tenantId, actor: actorId ?? 'system', entityType: 'impairment', entityId: draft.id, action: 'raised', after: { assetId, indicator: 'CONDITION', conditionGrade: to } });
  } catch (err) {
    logger.error('impairment indicator not raised', { assetId, err: String(err) });
  }
}

/** Records the assessment on a DRAFT, with the figures as they stand now. */
export async function assessImpairment(tenantId: string, actorId: string, id: string, input: {
  standard: ImpairmentStandard; method: ImpairmentMethod; recoverableAmount: number; assessmentNotes?: string; evidencePhotoIds?: string[];
}) {
  const draft = await findImpairment(tenantId, id);
  if (draft.status !== 'DRAFT') throw new ConflictError('Only a draft can be assessed', 'NOT_DRAFT');
  const f = await carryingFigures(tenantId, await findAsset(tenantId, draft.assetId));
  const recoverable = money(input.recoverableAmount).toDecimalPlaces(2);
  const m = measure(f, recoverable);
  const updated = await prisma.impairment.update({
    where: { id },
    data: {
      standard: input.standard, method: input.method, recoverableAmount: recoverable, carryingAmount: f.carrying, kind: m.kind, loss: m.loss,
      assessmentNotes: input.assessmentNotes ?? null, evidencePhotoIds: input.evidencePhotoIds ?? [], assessedBy: actorId, assessedAt: new Date(),
    },
    include: listInclude,
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'impairment', entityId: id, action: 'assessed', after: { kind: m.kind, loss: m.loss.toFixed(2), recoverable: recoverable.toFixed(2) } });
  return updated;
}

export async function dismissImpairment(tenantId: string, actorId: string, id: string, notes?: string) {
  const draft = await findImpairment(tenantId, id);
  if (draft.status !== 'DRAFT') throw new ConflictError('Only a draft can be dismissed', 'NOT_DRAFT');
  const updated = await prisma.impairment.update({ where: { id }, data: { status: 'DISMISSED', assessmentNotes: notes ?? draft.assessmentNotes } });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'impairment', entityId: id, action: 'dismissed', after: { notes: notes ?? null } });
  return updated;
}

/** The period must be open, and no later period may have posted depreciation. */
async function openPeriodFor(tenantId: string, periodId: string) {
  const period = await prisma.accountingPeriod.findFirst({ where: { id: periodId, tenantId } });
  if (!period) throw new NotFoundError('Accounting period not found');
  if (period.status !== 'OPEN') throw new ConflictError('The period is not open', 'PERIOD_NOT_OPEN');
  const later = await prisma.depreciationRun.count({
    where: { tenantId, ...effectiveRun, period: { OR: [{ year: { gt: period.year } }, { year: period.year, month: { gt: period.month } }] } },
  });
  if (later) throw new ConflictError('A later period is already posted; post into the latest open period', 'LATER_PERIOD_POSTED');
  return period;
}

/** Posts an assessed DRAFT, by someone other than its assessor (D17). */
export async function postImpairment(tenantId: string, actorId: string, id: string, periodId: string) {
  const draft = await findImpairment(tenantId, id);
  if (draft.status !== 'DRAFT') throw new ConflictError('Only a draft can be posted', 'NOT_DRAFT');
  if (draft.recoverableAmount === null || !draft.assessedBy) throw new ConflictError('Assess the impairment first', 'NOT_ASSESSED');
  if (draft.assessedBy === actorId) throw new ForbiddenError('The person who assessed an impairment cannot post it (D17)');
  const asset = await findAsset(tenantId, draft.assetId);
  if (asset.status === 'disposed') throw new ConflictError('The asset is disposed', 'DISPOSED');
  const period = await openPeriodFor(tenantId, periodId);
  const f = await carryingFigures(tenantId, asset);
  const m = measure(f, draft.recoverableAmount);
  if (m.loss.isZero()) throw new ConflictError('The recoverable amount is not below the carrying amount: dismiss it instead', 'NO_LOSS');
  if (m.kind !== draft.kind) throw new ConflictError('The carrying amount has moved since the assessment; assess it again', 'REASSESS');
  const posted = await prisma.impairment.update({
    where: { id },
    data: { status: 'POSTED', periodId: period.id, carryingAmount: f.carrying, loss: m.loss, postedBy: actorId, postedAt: new Date() },
    include: listInclude,
  });
  const after = f.carrying.minus(m.loss);
  await recordAssetEvent({
    tenantId, assetId: asset.id, eventType: 'IMPAIRED', actor: actorId, source: 'API',
    payload: { impairmentId: id, kind: m.kind, loss: m.loss.toFixed(2), carryingBefore: f.carrying.toFixed(2), carryingAfter: after.toFixed(2), period: `${period.year}-${String(period.month).padStart(2, '0')}` },
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'impairment', entityId: id, action: 'posted', after: { kind: m.kind, loss: m.loss.toFixed(2), periodId: period.id } });
  return posted;
}

/** Corrects a posted record with an offsetting one in an open period; the original is marked REVERSED. */
export async function correctImpairment(tenantId: string, actorId: string, id: string, periodId: string, notes?: string) {
  const original = await findImpairment(tenantId, id);
  if (original.status !== 'POSTED' || original.correctionOfId) throw new ConflictError('Only a posted impairment can be corrected', 'NOT_POSTED');
  const later = await prisma.impairment.count({ where: { tenantId, assetId: original.assetId, ...counted, postedAt: { gt: original.postedAt! } } });
  if (later) throw new ConflictError('A later impairment of the asset is posted; correct that one first', 'NOT_LATEST');
  const period = await openPeriodFor(tenantId, periodId);
  const offset = await prisma.$transaction(async (tx) => {
    const created = await tx.impairment.create({
      data: {
        tenantId, assetId: original.assetId, kind: original.kind, status: 'POSTED', indicator: original.indicator, standard: original.standard,
        method: original.method, carryingAmount: original.carryingAmount, recoverableAmount: original.recoverableAmount, loss: original.loss!.negated(),
        indicatorNotes: notes ?? null, correctionOfId: original.id, periodId: period.id, raisedBy: actorId, postedBy: actorId, postedAt: new Date(),
      },
      include: listInclude,
    });
    await tx.impairment.update({ where: { id }, data: { status: 'REVERSED', reversedBy: actorId, reversedAt: new Date() } });
    return created;
  });
  await recordAssetEvent({
    tenantId, assetId: original.assetId, eventType: 'IMPAIRED', actor: actorId, source: 'API',
    payload: { impairmentId: offset.id, correctionOf: id, kind: original.kind, loss: offset.loss!.toFixed(2), notes: notes ?? null },
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'impairment', entityId: id, action: 'corrected', after: { offsetId: offset.id, notes: notes ?? null } });
  return offset;
}
