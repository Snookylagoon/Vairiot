import { sumMoney, type Money } from '../../lib/money';
import { prisma } from '../../lib/prisma';

import type { computeDepreciation } from './projection';

// Posted depreciation as the register shows it (stage 2.9). Once an asset has
// posted entries, its accumulated depreciation and carrying amount come from
// the ledger; until then, from the straight-line projection (Phase 2 plan
// §2.2). Reversed runs and their reversals do not count.

export interface Posted {
  accumulated: Money;
  /** The charge of the latest posted period: the register's "monthly" figure. */
  lastCharge: Money;
}

/** Posted depreciation for the given assets (all of the tenant's when omitted). */
export async function postedDepreciation(tenantId: string, assetIds?: string[]): Promise<Map<string, Posted>> {
  if (assetIds && assetIds.length === 0) return new Map();
  const entries = await prisma.depreciationEntry.findMany({
    where: { tenantId, ...(assetIds && { assetId: { in: assetIds } }), run: { status: 'POSTED', reversalOfRunId: null } },
    select: { assetId: true, charge: true, period: { select: { year: true, month: true } } },
    orderBy: [{ period: { year: 'asc' } }, { period: { month: 'asc' } }],
  });
  const byAsset = new Map<string, typeof entries>();
  for (const e of entries) byAsset.set(e.assetId, [...(byAsset.get(e.assetId) ?? []), e]);
  return new Map([...byAsset].map(([id, es]) => [id, { accumulated: sumMoney(es.map((e) => e.charge)), lastCharge: es[es.length - 1].charge }]));
}

type Projection = ReturnType<typeof computeDepreciation>;

/** The figures to show: the ledger's where the asset has posted entries, else the projection. */
export function withLedger(projection: Projection, posted?: Posted) {
  if (!posted) return { ...projection, source: 'projection' as const };
  const accumulated = Number(posted.accumulated.toFixed(2));
  return {
    capitalizedCost: projection.capitalizedCost,
    monthlyDepreciation: Number(posted.lastCharge.toFixed(2)),
    accumulatedDepreciation: accumulated,
    netBookValue: Math.round((projection.capitalizedCost - accumulated) * 100) / 100,
    source: 'ledger' as const,
  };
}
