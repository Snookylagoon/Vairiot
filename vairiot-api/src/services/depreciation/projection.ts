import type { Prisma } from '@prisma/client';

// The on-the-fly straight-line projection the register has always shown
// (moved here from asset.service.ts at stage 2.3). It stays the figure for
// assets with no posted depreciation; once W4 posts runs, carrying amounts
// come from the ledger (Phase 2 plan §2.1).

export function computeDepreciation(asset: {
  purchaseCost: Prisma.Decimal | null;
  freightCost: Prisma.Decimal | null;
  installationCost: Prisma.Decimal | null;
  customsDuties: Prisma.Decimal | null;
  otherCapitalizedCosts: Prisma.Decimal | null;
  residualValue: Prisma.Decimal | null;
  usefulLifeMonths: number | null;
  depreciationStartDate: Date | null;
  depreciationMethod: string | null;
  /** Stage 2.3: an EXPENSED asset is not on the register as an asset. */
  recognitionStatus?: string | null;
}) {
  const purchase = Number(asset.purchaseCost ?? 0);
  const freight = Number(asset.freightCost ?? 0);
  const installation = Number(asset.installationCost ?? 0);
  const customs = Number(asset.customsDuties ?? 0);
  const other = Number(asset.otherCapitalizedCosts ?? 0);
  const capitalizedCost = purchase + freight + installation + customs + other;
  const residual = Number(asset.residualValue ?? 0);

  // Below its class's threshold: expensed when acquired, so nothing to
  // depreciate and no carrying amount (IPSAS 45 recognition, S2.1).
  if (asset.recognitionStatus === 'EXPENSED') {
    return { capitalizedCost: Math.round(capitalizedCost * 100) / 100, monthlyDepreciation: 0, accumulatedDepreciation: 0, netBookValue: 0 };
  }

  if (!asset.usefulLifeMonths || !asset.depreciationStartDate || capitalizedCost === 0) {
    return { capitalizedCost, monthlyDepreciation: 0, accumulatedDepreciation: 0, netBookValue: capitalizedCost };
  }

  const depreciableAmount = capitalizedCost - residual;
  const monthlyDepreciation = depreciableAmount / asset.usefulLifeMonths;

  const start = asset.depreciationStartDate;
  const now = new Date();
  const monthsElapsed = Math.max(0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
  const cappedMonths = Math.min(monthsElapsed, asset.usefulLifeMonths);
  const accumulatedDepreciation = monthlyDepreciation * cappedMonths;
  const netBookValue = capitalizedCost - accumulatedDepreciation;

  return {
    capitalizedCost: Math.round(capitalizedCost * 100) / 100,
    monthlyDepreciation: Math.round(monthlyDepreciation * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    netBookValue: Math.round(netBookValue * 100) / 100,
  };
}
