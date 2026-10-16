import { Prisma } from '@prisma/client';
import {
  assetAccountingSchema, FAIR_VALUE_ACQUISITIONS, PendingReviewReason, RecognitionStatus,
  type AcquisitionType, type RecognitionOverrideInput,
} from 'vairiot-shared';

import { NotFoundError, ValidationError } from '../lib/errors';
import { money, roundMoney, sumMoney, type Money, type MoneyInput } from '../lib/money';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';
import { tenantFeatureEnabled } from './tenant-features.service';

// IPSAS recognition (Phase 2, S2.1): an asset's class, how it was acquired,
// its capitalised cost and whether it is recognised, expensed below its
// class's threshold, or waiting for Finance (D20). All of it applies only to
// tenants with the `ipsas` module on; for others nothing here is written.

const COST_FIELDS = ['purchaseCost', 'freightCost', 'installationCost', 'customsDuties', 'otherCapitalizedCosts'] as const;
type CostField = (typeof COST_FIELDS)[number];
type Costs = Partial<Record<CostField, MoneyInput>>;

const ACCOUNTING_FIELDS = ['assetClassId', 'acquisitionType', 'fairValueAtRecognition', 'sourceEntity', 'recognitionDate'] as const;

/**
 * Purchase cost plus its components for an exchange acquisition; fair value at
 * recognition for a donation or transfer. Null when nothing has been entered,
 * which is not the same as a cost of zero.
 */
export function capitalisedCostOf(acquisitionType: AcquisitionType, costs: Costs, fairValue: MoneyInput): Money | null {
  if (FAIR_VALUE_ACQUISITIONS.includes(acquisitionType)) {
    return fairValue === null || fairValue === undefined || fairValue === '' ? null : roundMoney(fairValue);
  }
  const entered = COST_FIELDS.map((f) => costs[f]).filter((v) => v !== null && v !== undefined && v !== '');
  return entered.length === 0 ? null : roundMoney(sumMoney(entered));
}

/** The threshold rule: below the class's threshold an item is expensed, not recognised. */
export function recognitionFor(cls: { capitalisationThreshold: MoneyInput } | null, cost: Money | null) {
  if (!cls) return { status: RecognitionStatus.PendingReview, reason: PendingReviewReason.NoClass } as const;
  if (cost === null) return { status: RecognitionStatus.PendingReview, reason: PendingReviewReason.NoCost } as const;
  return cost.lessThan(money(cls.capitalisationThreshold))
    ? { status: RecognitionStatus.Expensed } as const
    : { status: RecognitionStatus.Recognised } as const;
}

type ExistingAsset = Partial<Record<CostField, MoneyInput>> & {
  categoryId?: string | null;
  assetClassId?: string | null;
  acquisitionType?: AcquisitionType;
  fairValueAtRecognition?: MoneyInput;
  recognitionStatus?: RecognitionStatus | null;
  recognitionOverride?: boolean;
};

/**
 * The accounting columns for an asset create (no `existing`) or update, from
 * the request and what the asset already holds. Empty when `ipsas` is off.
 * The class is the one sent, else the asset's, else its category's. On create
 * the class's default life, method and residual fill what was not sent.
 */
export async function resolveTenantAssetAccounting(
  tenantId: string, input: Record<string, unknown>, existing?: ExistingAsset,
): Promise<Record<string, unknown>> {
  if (!(await tenantFeatureEnabled(tenantId, 'ipsas'))) return {};

  const sent = Object.fromEntries(ACCOUNTING_FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
  const parsed = assetAccountingSchema.safeParse(sent);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const acc = parsed.data;

  const categoryId = (input.categoryId !== undefined ? input.categoryId : existing?.categoryId) as string | null | undefined;
  let classId = acc.assetClassId !== undefined ? acc.assetClassId : existing?.assetClassId ?? null;
  if (!classId && categoryId) {
    classId = (await prisma.category.findFirst({ where: { id: categoryId, tenantId }, select: { assetClassId: true } }))?.assetClassId ?? null;
  }
  const cls = classId ? await prisma.assetClass.findFirst({ where: { id: classId, tenantId } }) : null;
  if (acc.assetClassId && (!cls || !cls.active)) throw new ValidationError('Unknown or inactive asset class');

  const acquisitionType = acc.acquisitionType ?? existing?.acquisitionType ?? 'PURCHASE';
  const fairValue = acc.fairValueAtRecognition !== undefined ? acc.fairValueAtRecognition : existing?.fairValueAtRecognition;
  const costs = Object.fromEntries(COST_FIELDS.map((f) => [f, input[f] !== undefined ? input[f] as MoneyInput : existing?.[f]])) as Costs;
  const cost = capitalisedCostOf(acquisitionType, costs, fairValue);
  const status = existing?.recognitionOverride ? existing.recognitionStatus : recognitionFor(cls, cost).status;

  const out: Record<string, unknown> = {
    assetClassId: cls?.id ?? null,
    acquisitionType,
    capitalisedCost: cost,
    recognitionStatus: status,
    ...(acc.fairValueAtRecognition !== undefined && { fairValueAtRecognition: acc.fairValueAtRecognition === null ? null : roundMoney(acc.fairValueAtRecognition) }),
    ...(acc.sourceEntity !== undefined && { sourceEntity: acc.sourceEntity || null }),
    ...(acc.recognitionDate !== undefined && { recognitionDate: acc.recognitionDate }),
  };
  if (!existing && cls) {
    if (input.usefulLifeMonths == null && cls.defaultUsefulLifeMonths) out.usefulLifeMonths = cls.defaultUsefulLifeMonths;
    if (!input.depreciationMethod) out.depreciationMethod = cls.defaultDepreciationMethod;
    if (input.residualValue == null && cost && money(cls.defaultResidualPct).greaterThan(0)) {
      out.residualValue = roundMoney(cost.times(cls.defaultResidualPct).dividedBy(100));
    }
  }
  return out;
}

/** Re-applies the threshold rule to a class's assets after its threshold changed; overrides stay. */
export async function recomputeClassRecognition(tenantId: string, assetClassId: string): Promise<void> {
  const cls = await prisma.assetClass.findFirstOrThrow({ where: { id: assetClassId, tenantId } });
  const scope = { tenantId, assetClassId, deletedAt: null, recognitionOverride: false, capitalisedCost: { not: null } };
  await prisma.asset.updateMany({
    where: { ...scope, capitalisedCost: { lt: cls.capitalisationThreshold } }, data: { recognitionStatus: 'EXPENSED' },
  });
  await prisma.asset.updateMany({
    where: { ...scope, capitalisedCost: { gte: cls.capitalisationThreshold } }, data: { recognitionStatus: 'RECOGNISED' },
  });
}

/** Points a category at a class; its assets without a class take it, and are recognised again. */
export async function setCategoryClass(tenantId: string, actorId: string, categoryId: string, assetClassId: string | null) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
  if (!category) throw new NotFoundError('Category not found');
  if (assetClassId && !(await prisma.assetClass.findFirst({ where: { id: assetClassId, tenantId, active: true } }))) {
    throw new ValidationError('Unknown or inactive asset class');
  }
  const updated = await prisma.category.update({ where: { id: categoryId }, data: { assetClassId } });
  if (assetClassId) {
    await prisma.asset.updateMany({
      where: { tenantId, categoryId, assetClassId: null, deletedAt: null }, data: { assetClassId, recognitionStatus: 'PENDING_REVIEW' },
    });
    await recomputeClassRecognition(tenantId, assetClassId);
  }
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'category', entityId: categoryId, action: 'asset_class_set',
    before: { assetClassId: category.assetClassId }, after: { assetClassId },
  });
  return updated;
}

/** Assets Finance still has to classify or cost (D20), with the reason. */
export async function listPendingReview(tenantId: string) {
  const assets = await prisma.asset.findMany({
    where: { tenantId, deletedAt: null, recognitionStatus: 'PENDING_REVIEW' },
    select: {
      id: true, assetNumber: true, name: true, assetClassId: true, capitalisedCost: true, acquisitionType: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { assetNumber: 'asc' },
  });
  return assets.map((a) => ({ ...a, reason: a.assetClassId ? PendingReviewReason.NoCost : PendingReviewReason.NoClass }));
}

/**
 * Finance's override of the threshold rule (accounting:approve): the status
 * stays as set, with its reason, until cleared with `status: null`.
 */
export async function overrideRecognition(tenantId: string, actorId: string, assetId: string, input: RecognitionOverrideInput) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId, deletedAt: null } });
  if (!asset) throw new NotFoundError('Asset not found');
  let data: Prisma.AssetUpdateInput;
  if (input.status === null) {
    const cls = asset.assetClassId ? await prisma.assetClass.findFirst({ where: { id: asset.assetClassId, tenantId } }) : null;
    data = {
      recognitionOverride: false, recognitionOverrideReason: null,
      recognitionStatus: recognitionFor(cls, asset.capitalisedCost).status,
    };
  } else {
    data = { recognitionOverride: true, recognitionOverrideReason: input.reason, recognitionStatus: input.status };
  }
  const updated = await prisma.asset.update({ where: { id: assetId }, data });
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'asset', entityId: assetId,
    action: input.status === null ? 'recognition_override_cleared' : 'recognition_overridden',
    before: { recognitionStatus: asset.recognitionStatus, recognitionOverride: asset.recognitionOverride },
    after: { recognitionStatus: updated.recognitionStatus, recognitionOverride: updated.recognitionOverride, reason: updated.recognitionOverrideReason },
  });
  return updated;
}
