import { Prisma } from '@prisma/client';
import { componentTemplateLineSchema, type ComponentLinkInput, type ParentDisposalChoice } from 'vairiot-shared';
import { z } from 'zod';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { money, sumMoney, type Money } from '../lib/money';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';
import { computeDepreciation } from './depreciation/projection';
import { recognitionFor } from './recognition.service';
import { tenantFeatureEnabled } from './tenant-features.service';

// Assets held as parts (Phase 2, S2.2, IPSAS 45 significant parts): a parent
// and its components, one level deep (a database trigger refuses more). A
// component starts where its parent is and follows it while it has not been
// moved on its own. Recognition applies to the whole: the threshold is tested
// on the parent's roll-up cost and the components take the parent's status.
// All of this needs the `ipsas` module.

const POSITION = ['latitude', 'longitude', 'geoAccuracyMeters', 'geoSource', 'geoCapturedAt'] as const;
type Located = { siteId: string | null; locationId: string | null } & Partial<Record<(typeof POSITION)[number], unknown>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function findAsset(tenantId: string, id: string) {
  const asset = await prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

/** Where a new component starts: the parent's site, location and position, unless sent. */
function inheritedPlace(parent: Located, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (input.siteId === undefined) out.siteId = parent.siteId;
  if (input.locationId === undefined) out.locationId = parent.locationId;
  if (input.latitude === undefined && input.longitude === undefined && parent.latitude != null) {
    for (const f of POSITION) out[f] = parent[f];
  }
  return out;
}

/**
 * Component columns for an asset create (POST /assets with `parentAssetId`).
 * Existing assets are linked and moved with `setComponentParent` instead.
 */
export async function resolveComponentFields(tenantId: string, input: Record<string, unknown>, existing?: unknown) {
  if (existing || input.parentAssetId === undefined || input.parentAssetId === null) return {};
  if (!(await tenantFeatureEnabled(tenantId, 'ipsas'))) return {};
  const parent = await prisma.asset.findFirst({ where: { id: String(input.parentAssetId), tenantId, deletedAt: null } });
  if (!parent) throw new ValidationError('Unknown parent asset');
  if (parent.parentAssetId) throw new ValidationError('A component cannot have components');
  const role = typeof input.componentRole === 'string' && input.componentRole.trim() ? input.componentRole.trim().slice(0, 40) : 'other';
  return { parentAssetId: parent.id, componentRole: role, ...inheritedPlace(parent, input) };
}

/** The threshold rule on the whole: tested on the roll-up cost, applied to parent and parts. */
export async function recomputeGroupRecognition(tenantId: string, parentId: string): Promise<void> {
  const parent = await prisma.asset.findFirst({
    where: { id: parentId, tenantId },
    include: { assetClass: true, components: { where: { deletedAt: null } } },
  });
  if (!parent || parent.components.length === 0) return;
  const members = [parent, ...parent.components];
  const costs = members.map((m) => m.capitalisedCost).filter((c): c is Prisma.Decimal => c !== null);
  const rollUp: Money | null = costs.length === 0 ? null : sumMoney(costs);
  const status = recognitionFor(parent.assetClass, rollUp).status;
  const ids = members.filter((m) => !m.recognitionOverride && m.recognitionStatus !== status).map((m) => m.id);
  if (ids.length > 0) await prisma.asset.updateMany({ where: { id: { in: ids } }, data: { recognitionStatus: status } });
}

/** A detached component is judged on its own again. */
async function recomputeOwnRecognition(tenantId: string, assetId: string) {
  const a = await prisma.asset.findFirst({ where: { id: assetId, tenantId }, include: { assetClass: true } });
  if (!a || a.recognitionOverride || a.recognitionStatus === null) return;
  await prisma.asset.update({ where: { id: assetId }, data: { recognitionStatus: recognitionFor(a.assetClass, a.capitalisedCost).status } });
}

/**
 * After any asset write (create or update): a component's group is recognised
 * again; a parent's components follow the site, location and position it left,
 * where they were still with it.
 */
export async function afterAssetWrite(tenantId: string, asset: Located & { id: string; parentAssetId: string | null }, before?: Located) {
  if (!(await tenantFeatureEnabled(tenantId, 'ipsas'))) return;
  if (asset.parentAssetId) { await recomputeGroupRecognition(tenantId, asset.parentAssetId); return; }
  if (before) await followParent(tenantId, asset, before);
  await recomputeGroupRecognition(tenantId, asset.id);
}

/** Moves the components that were where the parent was. Also used by transfers. */
export async function followParent(tenantId: string, after: Located & { id: string }, before: Located) {
  const children = { tenantId, parentAssetId: after.id, deletedAt: null };
  if (!same(before.siteId, after.siteId)) {
    await prisma.asset.updateMany({ where: { ...children, siteId: before.siteId }, data: { siteId: after.siteId } });
  }
  if (!same(before.locationId, after.locationId)) {
    await prisma.asset.updateMany({ where: { ...children, locationId: before.locationId }, data: { locationId: after.locationId } });
  }
  if (!same(before.latitude, after.latitude) || !same(before.longitude, after.longitude)) {
    const at = { latitude: (before.latitude ?? null) as number | null, longitude: (before.longitude ?? null) as number | null };
    await prisma.asset.updateMany({
      where: { ...children, ...at },
      data: Object.fromEntries(POSITION.map((f) => [f, after[f] ?? null])) as Prisma.AssetUpdateManyMutationInput,
    });
  }
}

/** Attach an asset to a parent, move it to another, or detach it (`parentAssetId: null`). */
export async function setComponentParent(tenantId: string, actorId: string, assetId: string, input: ComponentLinkInput) {
  const asset = await findAsset(tenantId, assetId);
  const oldParent = asset.parentAssetId;
  let data: Prisma.AssetUncheckedUpdateInput;
  if (input.parentAssetId) {
    if (input.parentAssetId === assetId) throw new ValidationError('An asset cannot be its own component');
    const parent = await findAsset(tenantId, input.parentAssetId);
    if (parent.parentAssetId) throw new ValidationError('A component cannot have components');
    if (await prisma.asset.count({ where: { tenantId, parentAssetId: assetId, deletedAt: null } })) {
      throw new ValidationError('An asset with components cannot become a component');
    }
    data = {
      parentAssetId: parent.id,
      componentRole: input.componentRole ?? asset.componentRole ?? 'other',
      ...inheritedPlace(parent, {}),
    };
  } else {
    data = { parentAssetId: null, componentRole: null };
  }
  const updated = await prisma.asset.update({ where: { id: assetId }, data });
  if (input.parentAssetId) await recomputeGroupRecognition(tenantId, input.parentAssetId);
  if (oldParent && oldParent !== input.parentAssetId) await recomputeGroupRecognition(tenantId, oldParent);
  if (!input.parentAssetId) await recomputeOwnRecognition(tenantId, assetId);
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'asset', entityId: assetId,
    action: input.parentAssetId ? 'component_attached' : 'component_detached',
    before: { parentAssetId: oldParent, componentRole: asset.componentRole },
    after: { parentAssetId: updated.parentAssetId, componentRole: updated.componentRole },
  });
  return updated;
}

const groupSelect = {
  id: true, assetNumber: true, name: true, status: true, componentRole: true, parentAssetId: true,
  assetClassId: true, capitalisedCost: true, recognitionStatus: true, usefulLifeMonths: true,
  purchaseCost: true, freightCost: true, installationCost: true, customsDuties: true, otherCapitalizedCosts: true,
  residualValue: true, depreciationStartDate: true, depreciationMethod: true,
} as const;

/**
 * An asset with its components and the roll-up (own + components) of
 * capitalised cost, accumulated depreciation and net book value. Computed,
 * never stored. For a component, its parent instead.
 */
export async function getComponentGroup(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, tenantId, deletedAt: null },
    select: {
      ...groupSelect,
      parentAsset: { select: { id: true, assetNumber: true, name: true } },
      components: { where: { deletedAt: null }, select: groupSelect, orderBy: { assetNumber: 'asc' } },
    },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  const withDep = <T extends Parameters<typeof computeDepreciation>[0]>(a: T) => ({ ...a, depreciation: computeDepreciation(a) });
  const { components, parentAsset, ...own } = asset;
  const parts = components.map(withDep);
  const all = [withDep(own), ...parts];
  const total = (k: 'capitalizedCost' | 'accumulatedDepreciation' | 'netBookValue') =>
    Number(sumMoney(all.map((a) => a.depreciation[k])).toFixed(2));
  return {
    asset: withDep(own),
    parent: parentAsset,
    components: parts,
    rollUp: parts.length === 0 ? null : {
      capitalizedCost: total('capitalizedCost'), accumulatedDepreciation: total('accumulatedDepreciation'), netBookValue: total('netBookValue'),
    },
  };
}

/**
 * Before a parent is disposed: its components are disposed with it, or
 * detached, as the caller chose; without a choice the disposal is refused.
 */
export async function prepareParentDisposal(
  tenantId: string, assetId: string, choice: ParentDisposalChoice | undefined,
  dispose: (componentId: string) => Promise<unknown>, actorId: string,
) {
  const parts = await prisma.asset.findMany({ where: { tenantId, parentAssetId: assetId, deletedAt: null, status: { not: 'disposed' } }, select: { id: true } });
  if (parts.length === 0) return;
  if (!choice) {
    throw new ConflictError(`This asset has ${parts.length} component(s): dispose of them with it, or detach them first`, 'COMPONENTS_ACTIVE');
  }
  for (const p of parts) {
    if (choice === 'dispose') await dispose(p.id);
    else await setComponentParent(tenantId, actorId, p.id, { parentAssetId: null });
  }
}

/** Splits a total over template lines by their cost share; the parent keeps what is left. */
export function splitTemplateCost(total: number | null | undefined, lines: z.infer<typeof componentTemplateLineSchema>[]) {
  if (total === null || total === undefined) return { parent: null, parts: lines.map(() => null) };
  const t = money(total);
  const parts = lines.map((l) => t.times(l.costSharePct).dividedBy(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  const shared = t.times(sumMoney(lines.map((l) => l.costSharePct))).dividedBy(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  // Rounding: the last part takes the difference, so the parts add up exactly.
  if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].plus(shared.minus(sumMoney(parts)));
  return { parent: t.minus(shared), parts };
}
