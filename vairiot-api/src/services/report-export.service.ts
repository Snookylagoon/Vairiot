import axios from 'axios';
import { prisma } from '../lib/prisma';
import { computeDepreciation } from './asset.service';
import {
  depreciationRegister,
  fixedAssetRegister,
  assetAgingReport,
} from './report.service';

const REPORT_SERVICE_URL = process.env.REPORT_SERVICE_URL || 'http://localhost:8100';

interface ExportOpts {
  format: 'csv' | 'xlsx' | 'docx' | 'pdf';
  filters?: Record<string, string>;
}

async function getCompanyInfo(tenantId: string) {
  const company = await prisma.company.findUnique({ where: { tenantId } });
  if (!company) return {};
  return {
    legal_name: company.legalName ?? '',
    trading_name: company.tradingName ?? '',
    registration_number: company.registrationNumber ?? '',
    address_line1: company.addressLine1 ?? '',
    address_line2: company.addressLine2 ?? '',
    city: company.city ?? '',
    state_province: company.stateProvince ?? '',
    postal_code: company.postalCode ?? '',
    country: company.country ?? '',
    primary_contact_name: company.primaryContactName ?? '',
    primary_contact_email: company.primaryContactEmail ?? '',
    primary_contact_phone: company.primaryContactPhone ?? '',
  };
}

async function getTenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? '';
}

async function callReportService(payload: Record<string, unknown>): Promise<Buffer> {
  const response = await axios.post(`${REPORT_SERVICE_URL}/generate`, payload, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(response.data);
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = v.toISOString().slice(0, 10);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

export async function exportFixedAssetRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const rows = await fixedAssetRegister(tenantId, opts.filters ?? {});
  const serialized = serializeRows(rows);

  let totalCost = 0, totalCapitalized = 0, totalDepreciation = 0, totalNBV = 0;
  for (const r of rows) {
    totalCost += (r.purchaseCost as number) ?? 0;
    totalCapitalized += (r.capitalizedCost as number) ?? 0;
    totalDepreciation += (r.accumulatedDepreciation as number) ?? 0;
    totalNBV += (r.netBookValue as number) ?? 0;
  }

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'fixed-asset-register',
    format: opts.format,
    rows: serialized,
    totals: {
      count: rows.length,
      purchaseCost: Math.round(totalCost * 100) / 100,
      capitalizedCost: Math.round(totalCapitalized * 100) / 100,
      accumulatedDepreciation: Math.round(totalDepreciation * 100) / 100,
      netBookValue: Math.round(totalNBV * 100) / 100,
    },
    summary: {
      totalCost: Math.round(totalCost * 100) / 100,
      totalCapitalized: Math.round(totalCapitalized * 100) / 100,
      totalDepreciation: Math.round(totalDepreciation * 100) / 100,
      totalNBV: Math.round(totalNBV * 100) / 100,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportDepreciationSchedule(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const rows = await depreciationRegister(tenantId, opts.filters ?? {});
  const serialized = serializeRows(rows);

  let totalCapitalized = 0, totalMonthly = 0, totalDepreciation = 0, totalNBV = 0;
  for (const r of rows) {
    totalCapitalized += (r.capitalizedCost as number) ?? 0;
    totalMonthly += (r.monthlyDepreciation as number) ?? 0;
    totalDepreciation += (r.accumulatedDepreciation as number) ?? 0;
    totalNBV += (r.netBookValue as number) ?? 0;
  }

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'depreciation-schedule',
    format: opts.format,
    rows: serialized,
    totals: {
      count: rows.length,
      capitalizedCost: Math.round(totalCapitalized * 100) / 100,
      monthlyDepreciation: Math.round(totalMonthly * 100) / 100,
      accumulatedDepreciation: Math.round(totalDepreciation * 100) / 100,
      netBookValue: Math.round(totalNBV * 100) / 100,
    },
    summary: {
      totalCapitalized: Math.round(totalCapitalized * 100) / 100,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalDepreciation: Math.round(totalDepreciation * 100) / 100,
      totalNBV: Math.round(totalNBV * 100) / 100,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportAssetAging(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const result = await assetAgingReport(tenantId, opts.filters ?? {});
  const serialized = serializeRows(result.rows);

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'asset-aging',
    format: opts.format,
    rows: serialized,
    summary: {
      totalAssets: result.totalAssets,
      ...result.buckets,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportAssetValuationSummary(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const { categoryId, siteId, status } = opts.filters ?? {};
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
      purchaseCost: true, freightCost: true, installationCost: true,
      customsDuties: true, otherCapitalizedCosts: true, residualValue: true,
      depreciationMethod: true, usefulLifeMonths: true, depreciationStartDate: true,
      purchaseDate: true,
      category: { select: { name: true } },
      site: { select: { name: true } },
    },
  });

  const groups = new Map<string, {
    assetCount: number; totalPurchaseCost: number; totalCapitalizedCost: number;
    totalDepreciation: number; totalNBV: number; totalAgeMonths: number;
  }>();

  const now = new Date();
  for (const a of assets) {
    const label = `${a.site?.name ?? 'Unassigned'} / ${a.category?.name ?? 'Uncategorised'}`;
    const dep = computeDepreciation(a);
    const ageMonths = a.purchaseDate
      ? (now.getFullYear() - a.purchaseDate.getFullYear()) * 12 + (now.getMonth() - a.purchaseDate.getMonth())
      : 0;

    if (!groups.has(label)) {
      groups.set(label, { assetCount: 0, totalPurchaseCost: 0, totalCapitalizedCost: 0, totalDepreciation: 0, totalNBV: 0, totalAgeMonths: 0 });
    }
    const g = groups.get(label)!;
    g.assetCount++;
    g.totalPurchaseCost += Number(a.purchaseCost ?? 0);
    g.totalCapitalizedCost += dep.capitalizedCost;
    g.totalDepreciation += dep.accumulatedDepreciation;
    g.totalNBV += dep.netBookValue;
    g.totalAgeMonths += ageMonths;
  }

  const rows = Array.from(groups.entries()).map(([label, g]) => ({
    groupLabel: label,
    assetCount: g.assetCount,
    totalPurchaseCost: Math.round(g.totalPurchaseCost * 100) / 100,
    totalCapitalizedCost: Math.round(g.totalCapitalizedCost * 100) / 100,
    totalDepreciation: Math.round(g.totalDepreciation * 100) / 100,
    totalNBV: Math.round(g.totalNBV * 100) / 100,
    avgAge: g.assetCount > 0 ? Math.round(g.totalAgeMonths / g.assetCount * 10) / 10 : 0,
  }));

  const grandTotals = rows.reduce((acc, r) => ({
    assetCount: acc.assetCount + r.assetCount,
    totalPurchaseCost: acc.totalPurchaseCost + r.totalPurchaseCost,
    totalCapitalizedCost: acc.totalCapitalizedCost + r.totalCapitalizedCost,
    totalDepreciation: acc.totalDepreciation + r.totalDepreciation,
    totalNBV: acc.totalNBV + r.totalNBV,
  }), { assetCount: 0, totalPurchaseCost: 0, totalCapitalizedCost: 0, totalDepreciation: 0, totalNBV: 0 });

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'asset-valuation-summary',
    format: opts.format,
    rows,
    totals: {
      count: grandTotals.assetCount,
      totalPurchaseCost: Math.round(grandTotals.totalPurchaseCost * 100) / 100,
      totalCapitalizedCost: Math.round(grandTotals.totalCapitalizedCost * 100) / 100,
      totalDepreciation: Math.round(grandTotals.totalDepreciation * 100) / 100,
      totalNBV: Math.round(grandTotals.totalNBV * 100) / 100,
    },
    summary: {
      grandTotalCost: Math.round(grandTotals.totalPurchaseCost * 100) / 100,
      grandTotalNBV: Math.round(grandTotals.totalNBV * 100) / 100,
      grandTotalDepreciation: Math.round(grandTotals.totalDepreciation * 100) / 100,
      totalAssetCount: grandTotals.assetCount,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportAssetMovementHistory(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const { from, to, assetId } = opts.filters ?? {};

  const [transfers, checkouts, sites, locations] = await Promise.all([
    prisma.transfer.findMany({
      where: {
        tenantId,
        ...(assetId && { assetId }),
        ...(from || to ? { transferDate: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
      },
      include: {
        asset: { select: { assetNumber: true, name: true } },
      },
      orderBy: { transferDate: 'desc' },
    }),
    prisma.checkout.findMany({
      where: {
        tenantId,
        ...(assetId && { assetId }),
        ...(from || to ? { checkedOutAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
      },
      include: {
        asset: { select: { assetNumber: true, name: true } },
      },
      orderBy: { checkedOutAt: 'desc' },
    }),
    prisma.site.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { site: { tenantId } }, select: { id: true, name: true } }),
  ]);

  const siteMap = new Map(sites.map(s => [s.id, s.name]));
  const locMap = new Map(locations.map(l => [l.id, l.name]));

  const rows = [
    ...transfers.map(t => ({
      assetNumber: t.asset.assetNumber,
      assetName: t.asset.name,
      movementType: 'Transfer',
      movementDate: t.transferDate?.toISOString().slice(0, 10) ?? '',
      fromSite: (t.fromSiteId && siteMap.get(t.fromSiteId)) ?? '',
      fromLocation: (t.fromLocationId && locMap.get(t.fromLocationId)) ?? '',
      toSite: (t.toSiteId && siteMap.get(t.toSiteId)) ?? '',
      toLocation: (t.toLocationId && locMap.get(t.toLocationId)) ?? '',
      custodian: t.toCustodian ?? '',
      reason: t.reason ?? '',
      approvedBy: t.approvedBy ?? '',
    })),
    ...checkouts.map(c => ({
      assetNumber: c.asset.assetNumber,
      assetName: c.asset.name,
      movementType: 'Checkout',
      movementDate: c.checkedOutAt?.toISOString().slice(0, 10) ?? '',
      fromSite: '',
      fromLocation: '',
      toSite: '',
      toLocation: '',
      custodian: c.custodianId ?? '',
      reason: c.notes ?? '',
      approvedBy: '',
    })),
  ].sort((a, b) => b.movementDate.localeCompare(a.movementDate));

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'asset-movement-history',
    format: opts.format,
    rows,
    summary: {
      totalTransfers: transfers.length,
      totalCheckouts: checkouts.length,
      totalMovements: transfers.length + checkouts.length,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportAssetCondition(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const assets = await prisma.asset.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      condition: true,
      site: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  const groups = new Map<string, { new: number; good: number; fair: number; poor: number; damaged: number; total: number }>();

  for (const a of assets) {
    const label = `${a.site?.name ?? 'Unassigned'} / ${a.category?.name ?? 'Uncategorised'}`;
    if (!groups.has(label)) {
      groups.set(label, { new: 0, good: 0, fair: 0, poor: 0, damaged: 0, total: 0 });
    }
    const g = groups.get(label)!;
    g.total++;
    const c = (a.condition ?? '').toLowerCase();
    if (c === 'new') g.new++;
    else if (c === 'good') g.good++;
    else if (c === 'fair') g.fair++;
    else if (c === 'poor') g.poor++;
    else if (c === 'damaged') g.damaged++;
  }

  const rows = Array.from(groups.entries()).map(([label, g]) => ({
    groupLabel: label,
    totalAssets: g.total,
    new: g.new,
    good: g.good,
    fair: g.fair,
    poor: g.poor,
    damaged: g.damaged,
    pctGoodOrNew: g.total > 0 ? Math.round((g.new + g.good) / g.total * 1000) / 10 : 0,
  }));

  const totals = rows.reduce((acc, r) => ({
    totalAssets: acc.totalAssets + r.totalAssets,
    new: acc.new + r.new, good: acc.good + r.good, fair: acc.fair + r.fair,
    poor: acc.poor + r.poor, damaged: acc.damaged + r.damaged,
  }), { totalAssets: 0, new: 0, good: 0, fair: 0, poor: 0, damaged: 0 });

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'asset-condition',
    format: opts.format,
    rows,
    totals: {
      count: totals.totalAssets,
      totalAssets: totals.totalAssets,
      new: totals.new,
      good: totals.good,
      fair: totals.fair,
      poor: totals.poor,
      damaged: totals.damaged,
      pctGoodOrNew: totals.totalAssets > 0 ? Math.round((totals.new + totals.good) / totals.totalAssets * 1000) / 10 : 0,
    },
    summary: {
      totalAssets: totals.totalAssets,
      pctGood: totals.totalAssets > 0 ? Math.round((totals.new + totals.good) / totals.totalAssets * 1000) / 10 : 0,
      pctDamaged: totals.totalAssets > 0 ? Math.round(totals.damaged / totals.totalAssets * 1000) / 10 : 0,
    },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

export async function exportCustomFields(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const [assets, customFieldDefs] = await Promise.all([
    prisma.asset.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        assetNumber: true, name: true, status: true,
        customFields: true,
        category: { select: { name: true } },
        site: { select: { name: true } },
      },
      orderBy: { assetNumber: 'asc' },
    }),
    prisma.customFieldDefinition.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const rows = assets.map(a => {
    const base: Record<string, unknown> = {
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category?.name ?? '',
      site: a.site?.name ?? '',
      status: a.status,
    };
    const cf = (a.customFields as Record<string, unknown>) ?? {};
    for (const def of customFieldDefs) {
      base[`cf_${def.name}`] = cf[def.name] ?? '';
    }
    return base;
  });

  const extraColumns = customFieldDefs.map(def => ({
    key: `cf_${def.name}`,
    header: def.label,
    col_type: def.fieldType === 'date' ? 'date' : 'text',
    width_pct: customFieldDefs.length > 0 ? 40 / customFieldDefs.length : 0,
    align: 'left',
  }));

  const [company, tenantName] = await Promise.all([
    getCompanyInfo(tenantId),
    getTenantName(tenantId),
  ]);

  return callReportService({
    report_type: 'custom-fields',
    format: opts.format,
    rows,
    extra_columns: extraColumns,
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

const EXPORTERS: Record<string, (tenantId: string, opts: ExportOpts) => Promise<Buffer>> = {
  'fixed-asset-register': exportFixedAssetRegister,
  'depreciation-schedule': exportDepreciationSchedule,
  'asset-aging': exportAssetAging,
  'asset-valuation-summary': exportAssetValuationSummary,
  'asset-movement-history': exportAssetMovementHistory,
  'asset-condition': exportAssetCondition,
  'custom-fields': exportCustomFields,
};

export function getExporter(reportType: string) {
  return EXPORTERS[reportType] ?? null;
}

export function getAvailableReportTypes(): string[] {
  return Object.keys(EXPORTERS);
}
