import { sumMoney, type Money } from '../../lib/money';
import { prisma } from '../../lib/prisma';

import type { computeDepreciation } from './projection';

// Posted depreciation as the register shows it (stage 2.9). Once an asset has
// posted entries, its accumulated depreciation and carrying amount come from
// the ledger; until then, from the straight-line projection (Phase 2 plan
// §2.2). Reversed runs and their reversals do not count. Since stage 2.11 the
// carrying amount is also net of posted impairment (losses less reversals; a
// corrected record and its offset cancel out).

export interface Posted {
  accumulated: Money;
  /** The charge of the latest posted period: the register's "monthly" figure. */
  lastCharge: Money;
  /** Net posted impairment. */
  impaired: Money;
}

/** Posted depreciation for the given assets (all of the tenant's when omitted). */
export async function postedDepreciation(tenantId: string, assetIds?: string[]): Promise<Map<string, Posted>> {
  if (assetIds && assetIds.length === 0) return new Map();
  const assets = assetIds && { assetId: { in: assetIds } };
  const [entries, impairments] = await Promise.all([
    prisma.depreciationEntry.findMany({
      where: { tenantId, ...assets, run: { status: 'POSTED', reversalOfRunId: null } },
      select: { assetId: true, charge: true, period: { select: { year: true, month: true } } },
      orderBy: [{ period: { year: 'asc' } }, { period: { month: 'asc' } }],
    }),
    prisma.impairment.findMany({ where: { tenantId, ...assets, status: { in: ['POSTED', 'REVERSED'] } }, select: { assetId: true, loss: true } }),
  ]);
  const byAsset = new Map<string, typeof entries>();
  for (const e of entries) byAsset.set(e.assetId, [...(byAsset.get(e.assetId) ?? []), e]);
  const impaired = new Map<string, Money[]>();
  for (const i of impairments) if (i.loss) impaired.set(i.assetId, [...(impaired.get(i.assetId) ?? []), i.loss]);
  const ids = new Set([...byAsset.keys(), ...impaired.keys()]);
  return new Map([...ids].map((id) => {
    const es = byAsset.get(id) ?? [];
    return [id, { accumulated: sumMoney(es.map((e) => e.charge)), lastCharge: es.length ? es[es.length - 1].charge : sumMoney([]), impaired: sumMoney(impaired.get(id) ?? []) }];
  }));
}

type Projection = ReturnType<typeof computeDepreciation>;

/** The figures to show: the ledger's where the asset has posted entries, else the projection. */
export function withLedger(projection: Projection, posted?: Posted) {
  if (!posted) return { ...projection, source: 'projection' as const };
  const accumulated = Number(posted.accumulated.toFixed(2));
  const impaired = Number(posted.impaired.toFixed(2));
  return {
    capitalizedCost: projection.capitalizedCost,
    monthlyDepreciation: Number(posted.lastCharge.toFixed(2)),
    accumulatedDepreciation: accumulated,
    ...(impaired !== 0 && { accumulatedImpairment: impaired }),
    netBookValue: Math.round((projection.capitalizedCost - accumulated - impaired) * 100) / 100,
    source: 'ledger' as const,
  };
}
