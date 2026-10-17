import { prisma } from '../../lib/prisma';
import { computeDepreciation } from '../asset.service';
import { postedDepreciation, withLedger } from '../depreciation/ledger';
import { callReportService, getCompanyInfo, getTenantName, type ExportOpts } from '../report-export.service';

// The asset valuation summary (moved from report-export.service.ts at stage
// 2.12): totals by site and category of cost, accumulated depreciation, net
// posted impairment (stage 2.12) and net book value, from the ledger where
// an asset has posted figures, else the projection.

export async function exportAssetValuationSummary(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const { categoryId, siteId, status, rollUp } = opts.filters ?? {}; // rollUp=true: parts count under their parent (S2.2)
  const where = {
    tenantId,
    deletedAt: null,
    ...(status && { status }),
    ...(categoryId && { categoryId }),
    ...(siteId && { siteId }),
  };

  const assets = await prisma.asset.findMany({
    where,
    select: {
      id: true, purchaseCost: true, freightCost: true, installationCost: true,
      customsDuties: true, otherCapitalizedCosts: true, residualValue: true,
      depreciationMethod: true, usefulLifeMonths: true, depreciationStartDate: true,
      purchaseDate: true, recognitionStatus: true,
      category: { select: { name: true } },
      site: { select: { name: true } }, parentAsset: { select: { site: { select: { name: true } }, category: { select: { name: true } } } },
    },
  });

  const groups = new Map<string, {
    assetCount: number; totalPurchaseCost: number; totalCapitalizedCost: number;
    totalDepreciation: number; totalImpairment: number; totalNBV: number; totalAgeMonths: number;
  }>();

  const now = new Date(); const posted = await postedDepreciation(tenantId, assets.map((a) => a.id)); // ledger first (stage 2.9)
  for (const a of assets) {
    const part = rollUp === 'true' ? a.parentAsset : null; const label = `${(part ?? a).site?.name ?? 'Unassigned'} / ${(part ?? a).category?.name ?? 'Uncategorised'}`;
    const dep = withLedger(computeDepreciation(a), posted.get(a.id));
    const ageMonths = a.purchaseDate
      ? (now.getFullYear() - a.purchaseDate.getFullYear()) * 12 + (now.getMonth() - a.purchaseDate.getMonth())
      : 0;

    if (!groups.has(label)) {
      groups.set(label, { assetCount: 0, totalPurchaseCost: 0, totalCapitalizedCost: 0, totalDepreciation: 0, totalImpairment: 0, totalNBV: 0, totalAgeMonths: 0 });
    }
    const g = groups.get(label)!;
    if (!part) g.assetCount++;
    g.totalPurchaseCost += Number(a.purchaseCost ?? 0);
    g.totalCapitalizedCost += dep.capitalizedCost;
    g.totalDepreciation += dep.accumulatedDepreciation;
    g.totalImpairment += 'accumulatedImpairment' in dep ? dep.accumulatedImpairment ?? 0 : 0;
    g.totalNBV += dep.netBookValue;
    g.totalAgeMonths += part ? 0 : ageMonths;
  }

  const rows = Array.from(groups.entries()).map(([label, g]) => ({
    groupLabel: label,
    assetCount: g.assetCount,
    totalPurchaseCost: Math.round(g.totalPurchaseCost * 100) / 100,
    totalCapitalizedCost: Math.round(g.totalCapitalizedCost * 100) / 100,
    totalDepreciation: Math.round(g.totalDepreciation * 100) / 100,
    totalImpairment: Math.round(g.totalImpairment * 100) / 100,
    totalNBV: Math.round(g.totalNBV * 100) / 100,
    avgAge: g.assetCount > 0 ? Math.round(g.totalAgeMonths / g.assetCount * 10) / 10 : 0,
  }));

  const grandTotals = rows.reduce((acc, r) => ({
    assetCount: acc.assetCount + r.assetCount,
    totalPurchaseCost: acc.totalPurchaseCost + r.totalPurchaseCost,
    totalCapitalizedCost: acc.totalCapitalizedCost + r.totalCapitalizedCost,
    totalDepreciation: acc.totalDepreciation + r.totalDepreciation,
    totalImpairment: acc.totalImpairment + r.totalImpairment,
    totalNBV: acc.totalNBV + r.totalNBV,
  }), { assetCount: 0, totalPurchaseCost: 0, totalCapitalizedCost: 0, totalDepreciation: 0, totalImpairment: 0, totalNBV: 0 });

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService(tenantId, {
    report_type: 'asset-valuation-summary',
    format: opts.format,
    rows,
    totals: {
      count: grandTotals.assetCount,
      totalPurchaseCost: Math.round(grandTotals.totalPurchaseCost * 100) / 100,
      totalCapitalizedCost: Math.round(grandTotals.totalCapitalizedCost * 100) / 100,
      totalDepreciation: Math.round(grandTotals.totalDepreciation * 100) / 100,
      totalImpairment: Math.round(grandTotals.totalImpairment * 100) / 100,
      totalNBV: Math.round(grandTotals.totalNBV * 100) / 100,
    },
    summary: {
      grandTotalCost: Math.round(grandTotals.totalPurchaseCost * 100) / 100,
      grandTotalNBV: Math.round(grandTotals.totalNBV * 100) / 100,
      grandTotalDepreciation: Math.round(grandTotals.totalDepreciation * 100) / 100,
      grandTotalImpairment: Math.round(grandTotals.totalImpairment * 100) / 100,
      totalAssetCount: grandTotals.assetCount,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}
