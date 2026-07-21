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
  // Reports service reaches the logo via the public endpoint — no auth required.
  // Report service resolves this against its own network to the api container.
  const logoUrl = company.logoStorageKey
    ? `${process.env.API_INTERNAL_URL || 'http://vairiot_api:3001'}/api/v1/public/tenants/${tenantId}/logo`
    : null;
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
    logo_url: logoUrl,
  };
}

async function getTenantCurrency(tenantId: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { tenantId },
    select: { currency: true },
  });
  return company?.currency ?? 'USD';
}

async function getTenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? '';
}

async function callReportService(tenantId: string, payload: Record<string, unknown>): Promise<Buffer> {
  const currency = await getTenantCurrency(tenantId);
  const response = await axios.post(`${REPORT_SERVICE_URL}/generate`, { currency, ...payload }, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
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

  return callReportService(tenantId, {
    report_type: 'custom-fields',
    format: opts.format,
    rows,
    extra_columns: extraColumns,
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}

// ── DISPOSALS ───────────────────────────────────────────────────────────

export async function exportDisposalRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const disposals = await prisma.disposal.findMany({
    where: { tenantId },
    include: {
      asset: {
        select: {
          assetNumber: true, name: true,
          category: { select: { name: true } },
          site: { select: { name: true } },
        },
      },
    },
    orderBy: { disposalDate: 'desc' },
  });

  const rows = disposals.map(d => ({
    assetNumber: d.asset.assetNumber,
    assetName: d.asset.name,
    category: d.asset.category?.name ?? '',
    site: d.asset.site?.name ?? '',
    disposalDate: d.disposalDate?.toISOString().slice(0, 10) ?? '',
    disposalMethod: d.disposalMethod,
    disposalValue: Number(d.disposalValue ?? 0),
    netBookValueAtDisposal: Number(d.netBookValueAtDisposal ?? 0),
    gainLoss: Number(d.gainLoss ?? 0),
    reason: d.disposalReason ?? '',
    approvedBy: d.approvedBy ?? '',
  }));

  let totalDisposalValue = 0, totalNBV = 0, totalGainLoss = 0;
  for (const r of rows) {
    totalDisposalValue += r.disposalValue;
    totalNBV += r.netBookValueAtDisposal;
    totalGainLoss += r.gainLoss;
  }

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'disposal-register', format: opts.format, rows,
    totals: { count: rows.length, disposalValue: round2(totalDisposalValue), netBookValueAtDisposal: round2(totalNBV), gainLoss: round2(totalGainLoss) },
    summary: { totalDisposals: rows.length, totalDisposalValue: round2(totalDisposalValue), totalNBV: round2(totalNBV), totalGainLoss: round2(totalGainLoss) },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportDisposalGainLoss(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const disposals = await prisma.disposal.findMany({ where: { tenantId } });

  const groups = new Map<string, { count: number; totalDisposal: number; totalNBV: number; totalGain: number; totalLoss: number }>();
  for (const d of disposals) {
    const method = d.disposalMethod ?? 'Unknown';
    if (!groups.has(method)) groups.set(method, { count: 0, totalDisposal: 0, totalNBV: 0, totalGain: 0, totalLoss: 0 });
    const g = groups.get(method)!;
    g.count++;
    g.totalDisposal += Number(d.disposalValue ?? 0);
    g.totalNBV += Number(d.netBookValueAtDisposal ?? 0);
    const gl = Number(d.gainLoss ?? 0);
    if (gl >= 0) g.totalGain += gl; else g.totalLoss += gl;
  }

  const rows = Array.from(groups.entries()).map(([method, g]) => ({
    disposalMethod: method, count: g.count,
    totalDisposal: round2(g.totalDisposal), totalNBV: round2(g.totalNBV),
    totalGain: round2(g.totalGain), totalLoss: round2(g.totalLoss),
  }));

  const net = rows.reduce((a, r) => a + r.totalGain + r.totalLoss, 0);
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'disposal-gain-loss', format: opts.format, rows,
    totals: { count: disposals.length, totalDisposal: round2(rows.reduce((a, r) => a + r.totalDisposal, 0)), totalNBV: round2(rows.reduce((a, r) => a + r.totalNBV, 0)), totalGain: round2(rows.reduce((a, r) => a + r.totalGain, 0)), totalLoss: round2(rows.reduce((a, r) => a + r.totalLoss, 0)) },
    summary: { netGainLoss: round2(net), avgGainLoss: disposals.length > 0 ? round2(net / disposals.length) : 0, totalDisposals: disposals.length },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportDisposalByMethod(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const disposals = await prisma.disposal.findMany({ where: { tenantId } });

  const groups = new Map<string, { count: number; totalValue: number }>();
  let grandTotal = 0;
  for (const d of disposals) {
    const method = d.disposalMethod ?? 'Unknown';
    if (!groups.has(method)) groups.set(method, { count: 0, totalValue: 0 });
    const g = groups.get(method)!;
    g.count++;
    const val = Number(d.disposalValue ?? 0);
    g.totalValue += val;
    grandTotal += val;
  }

  const rows = Array.from(groups.entries()).map(([method, g]) => ({
    disposalMethod: method, count: g.count, totalValue: round2(g.totalValue),
    avgValue: g.count > 0 ? round2(g.totalValue / g.count) : 0,
    pctOfTotal: grandTotal > 0 ? round2(g.totalValue / grandTotal * 100) : 0,
  }));

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'disposal-by-method', format: opts.format, rows,
    totals: { count: disposals.length, totalValue: round2(grandTotal), avgValue: disposals.length > 0 ? round2(grandTotal / disposals.length) : 0, pctOfTotal: 100 },
    summary: { totalDisposals: disposals.length, totalValue: round2(grandTotal) },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── AUDITS ───────────────────────────────────────────────────────────────

export async function exportAuditCampaignSummary(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const campaigns = await prisma.auditCampaign.findMany({
    where: { tenantId },
    include: {
      _count: { select: { scanEvents: true, assets: true } },
      reconciliationItems: { select: { classification: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const sites = await prisma.site.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const siteMap = new Map(sites.map(s => [s.id, s.name]));

  const rows = campaigns.map(c => {
    const matched = c.reconciliationItems.filter(r => r.classification === 'matched').length;
    const missing = c.reconciliationItems.filter(r => r.classification === 'missing').length;
    const unexpected = c.reconciliationItems.filter(r => r.classification === 'unexpected').length;
    const total = c._count.assets || c.reconciliationItems.length;
    return {
      name: c.name, mode: c.mode, status: c.status,
      site: c.siteId ? siteMap.get(c.siteId) ?? '' : '',
      scheduledAt: c.scheduledAt?.toISOString().slice(0, 10) ?? '',
      startedAt: c.startedAt?.toISOString().slice(0, 10) ?? '',
      completedAt: c.completedAt?.toISOString().slice(0, 10) ?? '',
      totalAssets: total, scanned: c._count.scanEvents,
      matched, missing, unexpected,
      accuracy: total > 0 ? round2(matched / total * 100) : 0,
    };
  });

  const totalScanned = rows.reduce((a, r) => a + r.scanned, 0);
  const avgAcc = rows.length > 0 ? round2(rows.reduce((a, r) => a + r.accuracy, 0) / rows.length) : 0;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'audit-campaign-summary', format: opts.format, rows,
    summary: { totalCampaigns: rows.length, avgAccuracy: avgAcc, totalScanned },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportAuditReconciliation(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const campaignId = opts.filters?.campaignId;
  const items = await prisma.auditReconciliationItem.findMany({
    where: campaignId ? { campaignId } : { campaign: { tenantId } },
    include: {
      snapshotAsset: true,
      scanEvent: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const locations = await prisma.location.findMany({ where: { site: { tenantId } }, select: { id: true, name: true } });
  const locMap = new Map(locations.map(l => [l.id, l.name]));

  const rows = items.map(item => ({
    assetNumber: item.snapshotAsset?.assetNumber ?? '',
    assetName: item.snapshotAsset?.name ?? '',
    classification: item.classification,
    expectedLocation: item.snapshotLocationId ? locMap.get(item.snapshotLocationId) ?? '' : '',
    foundLocation: item.foundLocationId ? locMap.get(item.foundLocationId) ?? '' : '',
    expectedCondition: item.snapshotCondition ?? '',
    foundCondition: item.foundCondition ?? '',
    tagValue: item.scanEvent?.tagValue ?? '',
    notes: item.notes ?? '',
  }));

  const matched = rows.filter(r => r.classification === 'matched').length;
  const missing = rows.filter(r => r.classification === 'missing').length;
  const moved = rows.filter(r => r.classification === 'moved').length;
  const unexpected = rows.filter(r => r.classification === 'unexpected').length;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'audit-reconciliation', format: opts.format, rows,
    summary: { matched, missing, moved, unexpected },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportAuditScanLog(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const campaignId = opts.filters?.campaignId;

  const scans = await prisma.auditScanEvent.findMany({
    where: campaignId ? { campaignId } : { tenantId },
    orderBy: { scannedAt: 'desc' },
  });

  const assetIds = [...new Set(scans.map(s => s.assetId).filter(Boolean))] as string[];
  const assets = assetIds.length > 0 ? await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, assetNumber: true, name: true },
  }) : [];
  const assetMap = new Map(assets.map(a => [a.id, a]));

  const locations = await prisma.location.findMany({ where: { site: { tenantId } }, select: { id: true, name: true } });
  const locMap = new Map(locations.map(l => [l.id, l.name]));

  const devices = await prisma.device.findMany({ where: { tenantId }, select: { id: true, deviceName: true } });
  const deviceMap = new Map(devices.map(d => [d.id, d.deviceName]));

  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const rows = scans.map(s => {
    const asset = s.assetId ? assetMap.get(s.assetId) : null;
    return {
      scannedAt: s.scannedAt?.toISOString().slice(0, 19).replace('T', ' ') ?? '',
      tagValue: s.tagValue, assetNumber: asset?.assetNumber ?? '',
      assetName: asset?.name ?? '', result: s.result,
      location: s.locationId ? locMap.get(s.locationId) ?? '' : '',
      condition: s.condition ?? '',
      scannedBy: userMap.get(s.scannedBy) ?? s.scannedBy,
      device: s.deviceId ? deviceMap.get(s.deviceId) ?? '' : '',
    };
  });

  const matchedScans = rows.filter(r => r.result === 'matched').length;
  const unknownScans = rows.filter(r => r.result === 'unknown').length;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'audit-scan-log', format: opts.format, rows,
    summary: { totalScans: rows.length, matchedScans, unknownScans },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── MAINTENANCE ──────────────────────────────────────────────────────────

export async function exportMaintenanceLog(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const events = await prisma.maintenanceEvent.findMany({
    where: { tenantId },
    include: { asset: { select: { assetNumber: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const rows = events.map(e => ({
    assetNumber: e.asset.assetNumber, assetName: e.asset.name,
    maintenanceType: e.maintenanceType, status: e.status,
    vendor: e.vendor ?? '', workOrderNumber: e.workOrderNumber ?? '',
    scheduledDate: e.scheduledDate?.toISOString().slice(0, 10) ?? '',
    completedDate: e.completedDate?.toISOString().slice(0, 10) ?? '',
    cost: Number(e.cost ?? 0), description: e.description ?? '',
  }));

  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'maintenance-log', format: opts.format, rows,
    totals: { count: rows.length, cost: round2(totalCost) },
    summary: { totalEvents: rows.length, totalCost: round2(totalCost), avgCost: rows.length > 0 ? round2(totalCost / rows.length) : 0 },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportMaintenanceCostSummary(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const events = await prisma.maintenanceEvent.findMany({ where: { tenantId } });

  const groups = new Map<string, { count: number; totalCost: number }>();
  let grandTotal = 0;
  for (const e of events) {
    const key = `${e.maintenanceType}|${e.vendor ?? 'N/A'}`;
    if (!groups.has(key)) groups.set(key, { count: 0, totalCost: 0 });
    const g = groups.get(key)!;
    g.count++;
    const cost = Number(e.cost ?? 0);
    g.totalCost += cost;
    grandTotal += cost;
  }

  const rows = Array.from(groups.entries()).map(([key, g]) => {
    const [maintenanceType, vendor] = key.split('|');
    return {
      maintenanceType, vendor, eventCount: g.count,
      totalCost: round2(g.totalCost), avgCost: round2(g.totalCost / g.count),
      pctOfTotal: grandTotal > 0 ? round2(g.totalCost / grandTotal * 100) : 0,
    };
  });

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'maintenance-cost-summary', format: opts.format, rows,
    totals: { eventCount: events.length, totalCost: round2(grandTotal), avgCost: events.length > 0 ? round2(grandTotal / events.length) : 0, pctOfTotal: 100 },
    summary: { grandTotal: round2(grandTotal), totalEvents: events.length },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportMaintenanceSchedule(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const events = await prisma.maintenanceEvent.findMany({
    where: { tenantId, status: { in: ['scheduled', 'in_progress', 'overdue'] } },
    include: { asset: { select: { assetNumber: true, name: true } } },
    orderBy: { scheduledDate: 'asc' },
  });

  const now = new Date();
  const rows = events.map(e => {
    const scheduled = e.scheduledDate;
    const daysUntil = scheduled ? Math.ceil((scheduled.getTime() - now.getTime()) / 86400000) : null;
    return {
      assetNumber: e.asset.assetNumber, assetName: e.asset.name,
      maintenanceType: e.maintenanceType, vendor: e.vendor ?? '',
      workOrderNumber: e.workOrderNumber ?? '',
      scheduledDate: scheduled?.toISOString().slice(0, 10) ?? '',
      status: e.status, daysUntilDue: daysUntil ?? '',
      description: e.description ?? '',
    };
  });

  const overdueCount = rows.filter(r => typeof r.daysUntilDue === 'number' && r.daysUntilDue < 0).length;
  const upcomingCount = rows.filter(r => typeof r.daysUntilDue === 'number' && r.daysUntilDue >= 0).length;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'maintenance-schedule', format: opts.format, rows,
    summary: { overdueCount, upcomingCount, totalScheduled: rows.length },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── CHECKOUTS ────────────────────────────────────────────────────────────

export async function exportCheckoutLog(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const checkouts = await prisma.checkout.findMany({
    where: { tenantId },
    include: { asset: { select: { assetNumber: true, name: true } } },
    orderBy: { checkedOutAt: 'desc' },
  });

  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const now = new Date();
  const rows = checkouts.map(c => ({
    assetNumber: c.asset.assetNumber, assetName: c.asset.name,
    custodian: userMap.get(c.custodianId) ?? c.custodianId,
    checkedOutBy: userMap.get(c.checkedOutBy) ?? c.checkedOutBy,
    checkedOutAt: c.checkedOutAt?.toISOString().slice(0, 10) ?? '',
    expectedReturn: c.expectedReturn?.toISOString().slice(0, 10) ?? '',
    checkedInAt: c.checkedInAt?.toISOString().slice(0, 10) ?? '',
    checkedInBy: c.checkedInBy ? userMap.get(c.checkedInBy) ?? c.checkedInBy : '',
    status: c.checkedInAt ? 'Returned' : (c.expectedReturn && c.expectedReturn < now ? 'Overdue' : 'Out'),
    notes: c.notes ?? '',
  }));

  const currentlyOut = rows.filter(r => r.status !== 'Returned').length;
  const overdueCount = rows.filter(r => r.status === 'Overdue').length;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'checkout-log', format: opts.format, rows,
    summary: { totalCheckouts: rows.length, currentlyOut, overdueCount },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportCurrentCheckouts(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const checkouts = await prisma.checkout.findMany({
    where: { tenantId, checkedInAt: null },
    include: {
      asset: {
        select: { assetNumber: true, name: true, category: { select: { name: true } } },
      },
    },
    orderBy: { checkedOutAt: 'desc' },
  });

  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const now = new Date();
  const rows = checkouts.map(c => {
    const daysOut = Math.ceil((now.getTime() - c.checkedOutAt.getTime()) / 86400000);
    const overdue = c.expectedReturn && c.expectedReturn < now;
    return {
      assetNumber: c.asset.assetNumber, assetName: c.asset.name,
      category: c.asset.category?.name ?? '',
      custodian: userMap.get(c.custodianId) ?? c.custodianId,
      checkedOutBy: userMap.get(c.checkedOutBy) ?? c.checkedOutBy,
      checkedOutAt: c.checkedOutAt?.toISOString().slice(0, 10) ?? '',
      expectedReturn: c.expectedReturn?.toISOString().slice(0, 10) ?? '',
      daysOut, overdue: overdue ? 'Yes' : 'No', notes: c.notes ?? '',
    };
  });

  const overdueCount = rows.filter(r => r.overdue === 'Yes').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'current-checkouts', format: opts.format, rows,
    summary: { totalOut: rows.length, overdueCount },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportCheckoutHistoryByAsset(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const checkouts = await prisma.checkout.findMany({
    where: { tenantId },
    include: {
      asset: {
        select: { assetNumber: true, name: true, category: { select: { name: true } } },
      },
    },
  });

  const now = new Date();
  const groups = new Map<string, { asset: typeof checkouts[0]['asset']; checkouts: typeof checkouts }>();
  for (const c of checkouts) {
    if (!groups.has(c.assetId)) groups.set(c.assetId, { asset: c.asset, checkouts: [] });
    groups.get(c.assetId)!.checkouts.push(c);
  }

  const rows = Array.from(groups.values()).map(g => {
    const durations = g.checkouts.map(c => {
      const end = c.checkedInAt ?? now;
      return Math.ceil((end.getTime() - c.checkedOutAt.getTime()) / 86400000);
    });
    const currentlyOut = g.checkouts.some(c => !c.checkedInAt);
    const lastCheckout = g.checkouts.reduce((max, c) => c.checkedOutAt > max ? c.checkedOutAt : max, new Date(0));
    return {
      assetNumber: g.asset.assetNumber, assetName: g.asset.name,
      category: g.asset.category?.name ?? '',
      totalCheckouts: g.checkouts.length,
      avgDaysOut: round2(durations.reduce((a, d) => a + d, 0) / durations.length),
      maxDaysOut: Math.max(...durations),
      currentlyOut: currentlyOut ? 'Yes' : 'No',
      lastCheckoutDate: lastCheckout.toISOString().slice(0, 10),
    };
  });

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'checkout-history-by-asset', format: opts.format, rows,
    totals: { totalCheckouts: checkouts.length },
    summary: { totalAssets: rows.length, totalCheckouts: checkouts.length },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── LICENCES ─────────────────────────────────────────────────────────────

export async function exportLicenceRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const licences = await prisma.licence.findMany({
    where: { tenantId },
    include: {
      tier: true,
      _count: { select: { devices: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = licences.map(l => ({
    licenceNumber: l.licenceNumber, tier: l.tier.displayName, status: l.status,
    activatedAt: l.activatedAt?.toISOString().slice(0, 10) ?? '',
    expiresAt: l.expiresAt?.toISOString().slice(0, 10) ?? '',
    durationMonths: l.durationMonths, maxAssets: l.tier.maxAssets,
    devicesUsed: l._count.devices, baseDevices: l.tier.baseDevices,
    pricePerYear: Number(l.tier.pricePerYear), paymentStatus: l.paymentConfirmed ? 'Confirmed' : 'Pending',
  }));

  const activeLicences = rows.filter(r => r.status === 'active').length;
  const expiredCount = rows.filter(r => r.status === 'expired').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'licence-register', format: opts.format, rows,
    summary: { totalLicences: rows.length, activeLicences, expiredCount },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportLicenceExpiry(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const licences = await prisma.licence.findMany({
    where: { tenantId, status: { in: ['active', 'expiring', 'expired'] } },
    include: { tier: true, tenant: { select: { name: true } } },
    orderBy: { expiresAt: 'asc' },
  });

  const now = new Date();
  const rows = licences.map(l => {
    const daysRemaining = l.expiresAt ? Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000) : null;
    return {
      licenceNumber: l.licenceNumber, tier: l.tier.displayName, status: l.status,
      expiresAt: l.expiresAt?.toISOString().slice(0, 10) ?? '',
      daysRemaining: daysRemaining ?? '', gracePeriodDays: l.gracePeriodDays,
      tenant: l.tenant.name, maxAssets: l.tier.maxAssets,
      pricePerYear: Number(l.tier.pricePerYear),
    };
  });

  const expiringCount = rows.filter(r => typeof r.daysRemaining === 'number' && r.daysRemaining >= 0 && r.daysRemaining <= 30).length;
  const expiredCount = rows.filter(r => typeof r.daysRemaining === 'number' && r.daysRemaining < 0).length;
  const totalRevenue = rows.filter(r => typeof r.daysRemaining === 'number' && r.daysRemaining <= 30).reduce((a, r) => a + r.pricePerYear, 0);

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'licence-expiry', format: opts.format, rows,
    summary: { expiringCount, expiredCount, totalRevenue: round2(totalRevenue) },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportDeviceAllocation(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const devices = await prisma.device.findMany({
    where: { tenantId },
    include: {
      user: { select: { name: true } },
      licence: { select: { licenceNumber: true, status: true }, },
    },
    orderBy: { createdAt: 'desc' },
  });

  const licences = await prisma.licence.findMany({
    where: { tenantId },
    include: { tier: true },
  });
  const licTierMap = new Map(licences.map(l => [l.id, l.tier.displayName]));

  const rows = devices.map(d => ({
    licenceNumber: d.licence?.licenceNumber ?? '', tier: d.licenceId ? licTierMap.get(d.licenceId) ?? '' : '',
    deviceName: d.deviceName, deviceType: d.deviceType,
    serialNumber: d.serialNumber ?? '', userName: d.user?.name ?? '',
    active: d.active ? 'Yes' : 'No',
    activatedAt: d.activatedAt?.toISOString().slice(0, 10) ?? '',
    lastSeenAt: d.lastSeenAt?.toISOString().slice(0, 10) ?? '',
    status: d.licence?.status ?? '',
  }));

  const activeDevices = rows.filter(r => r.active === 'Yes').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'device-allocation', format: opts.format, rows,
    totals: { deviceName: rows.length },
    summary: { totalDevices: rows.length, activeDevices },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── TENANTS ──────────────────────────────────────────────────────────────

export async function exportTenantRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const tenants = await prisma.tenant.findMany({
    include: {
      parentTenant: { select: { name: true } },
      _count: { select: { users: true, assets: true } },
      licences: { where: { status: 'active' }, include: { tier: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = tenants.map(t => ({
    name: t.name, plan: t.plan, active: t.active ? 'Yes' : 'No',
    parentTenant: t.parentTenant?.name ?? '',
    userCount: t._count.users, assetCount: t._count.assets,
    licenceStatus: t.licences[0]?.status ?? 'none',
    licenceTier: t.licences[0]?.tier.displayName ?? '',
    licenceExpiry: t.licences[0]?.expiresAt?.toISOString().slice(0, 10) ?? '',
    onboarded: t.onboardingComplete ? 'Yes' : 'No',
    createdAt: t.createdAt?.toISOString().slice(0, 10) ?? '',
  }));

  const activeTenants = rows.filter(r => r.active === 'Yes').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'tenant-register', format: opts.format, rows,
    summary: { totalTenants: rows.length, activeTenants },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportTenantActivity(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: { users: true, assets: true, auditCampaigns: true, checkouts: true },
      },
    },
  });

  const rows = await Promise.all(tenants.map(async (t) => {
    const [maintenanceCount, disposalCount, totalAssetValue] = await Promise.all([
      prisma.maintenanceEvent.count({ where: { tenantId: t.id } }),
      prisma.disposal.count({ where: { tenantId: t.id } }),
      prisma.asset.aggregate({ where: { tenantId: t.id, deletedAt: null }, _sum: { purchaseCost: true } }),
    ]);

    const lastEvent = await prisma.auditEvent.findFirst({
      where: { tenantId: t.id },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });

    return {
      name: t.name, assetCount: t._count.assets, userCount: t._count.users,
      auditCount: t._count.auditCampaigns, checkoutCount: t._count.checkouts,
      maintenanceCount, disposalCount,
      totalAssetValue: round2(Number(totalAssetValue._sum.purchaseCost ?? 0)),
      lastActivity: lastEvent?.occurredAt?.toISOString().slice(0, 10) ?? '',
      plan: t.plan, active: t.active ? 'Yes' : 'No',
    };
  }));

  const totalAssets = rows.reduce((a, r) => a + r.assetCount, 0);
  const totalUsers = rows.reduce((a, r) => a + r.userCount, 0);
  const totalValue = rows.reduce((a, r) => a + r.totalAssetValue, 0);

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'tenant-activity', format: opts.format, rows,
    totals: { assetCount: totalAssets, userCount: totalUsers, totalAssetValue: round2(totalValue) },
    summary: { totalAssets, totalUsers, totalValue: round2(totalValue) },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── USERS ────────────────────────────────────────────────────────────────

export async function exportUserRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const users = await prisma.user.findMany({
    where: { tenantId },
    include: { roles: { include: { role: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
  });

  const now = new Date();
  const rows = users.map(u => ({
    name: u.name, email: u.email, phone: u.phone ?? '',
    roles: u.roles.map(r => r.role.name).join(', '),
    active: u.active ? 'Yes' : 'No',
    twoFactorEnabled: u.twoFactorEnabled ? 'Yes' : 'No',
    lastLoginAt: u.lastLoginAt?.toISOString().slice(0, 10) ?? 'Never',
    failedLogins: u.failedLoginCount,
    locked: u.lockedUntil && u.lockedUntil > now ? 'Yes' : 'No',
    createdAt: u.createdAt?.toISOString().slice(0, 10) ?? '',
  }));

  const activeUsers = rows.filter(r => r.active === 'Yes').length;
  const lockedUsers = rows.filter(r => r.locked === 'Yes').length;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'user-register', format: opts.format, rows,
    summary: { totalUsers: rows.length, activeUsers, lockedUsers },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportUserAccessReport(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const users = await prisma.user.findMany({
    where: { tenantId },
    include: {
      roles: { include: { role: { select: { name: true, permissions: true } } } },
      permissionOverrides: true,
    },
    orderBy: { name: 'asc' },
  });

  const rows = users.map(u => {
    const allPerms = new Set<string>();
    u.roles.forEach(r => r.role.permissions.forEach(p => allPerms.add(p)));
    const overrides = u.permissionOverrides.map(o => `${o.permission}=${o.granted ? 'grant' : 'deny'}`).join(', ');
    return {
      name: u.name, email: u.email,
      roles: u.roles.map(r => r.role.name).join(', '),
      permissions: Array.from(allPerms).slice(0, 5).join(', ') + (allPerms.size > 5 ? ` (+${allPerms.size - 5})` : ''),
      overrides: overrides || 'None',
      active: u.active ? 'Yes' : 'No',
      lastLoginAt: u.lastLoginAt?.toISOString().slice(0, 10) ?? 'Never',
    };
  });

  const usersWithOverrides = rows.filter(r => r.overrides !== 'None').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'user-access-report', format: opts.format, rows,
    summary: { totalUsers: rows.length, usersWithOverrides },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportUserActivityLog(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const { from, to, actorId } = opts.filters ?? {};
  const events = await prisma.auditEvent.findMany({
    where: {
      tenantId,
      ...(actorId && { actorId }),
      ...(from || to ? { occurredAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
    },
    include: { actor: { select: { name: true } } },
    orderBy: { occurredAt: 'desc' },
    take: 10000,
  });

  const rows = events.map(e => {
    const before = e.before as Record<string, unknown> | null;
    const after = e.after as Record<string, unknown> | null;
    let fieldChanged = '', valueBefore = '', valueAfter = '';
    if (before && after) {
      const changedKeys = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      fieldChanged = changedKeys.slice(0, 3).join(', ');
      if (changedKeys.length === 1) {
        valueBefore = String(before[changedKeys[0]] ?? '');
        valueAfter = String(after[changedKeys[0]] ?? '');
      }
    }
    return {
      occurredAt: e.occurredAt?.toISOString().slice(0, 19).replace('T', ' ') ?? '',
      actorName: e.actor?.name ?? '', action: e.action,
      entityType: e.entityType, entityId: e.entityId,
      fieldChanged, valueBefore, valueAfter,
      metadata: e.metadata ? 'Yes' : '',
    };
  });

  const uniqueUsers = new Set(events.map(e => e.actorId).filter(Boolean)).size;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'user-activity-log', format: opts.format, rows,
    summary: { totalEvents: rows.length, uniqueUsers },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── EXCEPTIONS ───────────────────────────────────────────────────────────

export async function exportExceptionSummary(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const now = new Date();

  const warrantyExpiring = await prisma.asset.count({ where: { tenantId, deletedAt: null, warrantyExpiry: { lte: new Date(now.getTime() + 30 * 86400000), gte: now } } });
  const warrantyExpired = await prisma.asset.count({ where: { tenantId, deletedAt: null, warrantyExpiry: { lt: now } } });
  const overdueCheckouts = await prisma.checkout.count({ where: { tenantId, checkedInAt: null, expectedReturn: { lt: now } } });
  const overdueMaintenance = await prisma.maintenanceEvent.count({ where: { tenantId, status: 'scheduled', scheduledDate: { lt: now } } });
  const expiringLicences = await prisma.licence.count({ where: { tenantId, status: { in: ['expiring', 'expired'] } } });
  const damagedAssets = await prisma.asset.count({ where: { tenantId, deletedAt: null, condition: { in: ['Poor', 'Damaged', 'poor', 'damaged'] } } });

  const rows = [
    { exceptionType: 'Warranty expiring', severity: 'Warning', count: warrantyExpiring, entityType: 'Asset', description: 'Assets with warranties expiring within 30 days', firstOccurred: '', lastOccurred: '' },
    { exceptionType: 'Warranty expired', severity: 'Critical', count: warrantyExpired, entityType: 'Asset', description: 'Assets with expired warranties', firstOccurred: '', lastOccurred: '' },
    { exceptionType: 'Overdue checkout', severity: 'Warning', count: overdueCheckouts, entityType: 'Checkout', description: 'Assets not returned by expected date', firstOccurred: '', lastOccurred: '' },
    { exceptionType: 'Overdue maintenance', severity: 'Warning', count: overdueMaintenance, entityType: 'Maintenance', description: 'Scheduled maintenance past due date', firstOccurred: '', lastOccurred: '' },
    { exceptionType: 'Licence expiring/expired', severity: 'Critical', count: expiringLicences, entityType: 'Licence', description: 'Licences expiring or already expired', firstOccurred: '', lastOccurred: '' },
    { exceptionType: 'Damaged/poor condition', severity: 'Warning', count: damagedAssets, entityType: 'Asset', description: 'Assets in poor or damaged condition', firstOccurred: '', lastOccurred: '' },
  ].filter(r => r.count > 0);

  const criticalCount = rows.filter(r => r.severity === 'Critical').reduce((a, r) => a + r.count, 0);
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'exception-summary', format: opts.format, rows,
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    summary: { totalExceptions: rows.reduce((a, r) => a + r.count, 0), criticalCount },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

export async function exportAlertSubscriptions(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const subs = await prisma.alertSubscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });

  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } });
  const userMap = new Map(users.map(u => [u.id, u]));

  const rows = subs.map(s => {
    const user = userMap.get(s.userId);
    return {
      userName: user?.name ?? s.userId, email: user?.email ?? '',
      exceptionType: s.exceptionType, channel: s.channel, frequency: s.frequency,
      active: s.active ? 'Yes' : 'No',
      lastSentAt: s.lastSentAt?.toISOString().slice(0, 10) ?? '',
      createdAt: s.createdAt?.toISOString().slice(0, 10) ?? '',
    };
  });

  const activeSubs = rows.filter(r => r.active === 'Yes').length;
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'alert-subscriptions', format: opts.format, rows,
    summary: { totalSubs: rows.length, activeSubs },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── COMPANY ──────────────────────────────────────────────────────────────

export async function exportCompanyProfile(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const company = await prisma.company.findUnique({ where: { tenantId } });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, plan: true } });
  const clients = await prisma.clientCompany.findMany({ where: { tenantId } });

  const rows = [
    { field: 'Tenant name', value: tenant?.name ?? '' },
    { field: 'Plan', value: tenant?.plan ?? '' },
    { field: 'Legal name', value: company?.legalName ?? '' },
    { field: 'Trading name', value: company?.tradingName ?? '' },
    { field: 'Registration number', value: company?.registrationNumber ?? '' },
    { field: 'Address', value: [company?.addressLine1, company?.addressLine2, company?.city, company?.stateProvince, company?.postalCode, company?.country].filter(Boolean).join(', ') },
    { field: 'Primary contact', value: company?.primaryContactName ?? '' },
    { field: 'Contact email', value: company?.primaryContactEmail ?? '' },
    { field: 'Contact phone', value: company?.primaryContactPhone ?? '' },
    { field: '', value: '' },
    { field: 'Client companies', value: String(clients.length) },
    ...clients.map(c => ({
      field: `  ${c.legalName}`,
      value: [c.tradingName, c.city, c.country, c.active ? 'Active' : 'Inactive'].filter(Boolean).join(' | '),
    })),
  ];

  const companyInfo = company ? {
    legal_name: company.legalName ?? '', address_line1: company.addressLine1 ?? '',
    city: company.city ?? '', country: company.country ?? '',
  } : {};

  return callReportService(tenantId, {
    report_type: 'company-profile', format: opts.format, rows,
    summary: {}, filters: opts.filters ?? {},
    company: companyInfo, tenant_name: tenant?.name ?? '',
  });
}

export async function exportComplianceOverview(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const now = new Date();

  const [totalAssets, assetsWithBarcode, assetsWithCategory, assetsWithSite, warrantyCount, warrantyExpired, totalCheckouts, overdueCheckouts, totalMaintenance, overdueMaintenance, totalAudits, completedAudits] = await Promise.all([
    prisma.asset.count({ where: { tenantId, deletedAt: null } }),
    prisma.asset.count({ where: { tenantId, deletedAt: null, barcode: { not: null } } }),
    prisma.asset.count({ where: { tenantId, deletedAt: null, categoryId: { not: null } } }),
    prisma.asset.count({ where: { tenantId, deletedAt: null, siteId: { not: null } } }),
    prisma.asset.count({ where: { tenantId, deletedAt: null, warrantyExpiry: { not: null } } }),
    prisma.asset.count({ where: { tenantId, deletedAt: null, warrantyExpiry: { lt: now } } }),
    prisma.checkout.count({ where: { tenantId } }),
    prisma.checkout.count({ where: { tenantId, checkedInAt: null, expectedReturn: { lt: now } } }),
    prisma.maintenanceEvent.count({ where: { tenantId } }),
    prisma.maintenanceEvent.count({ where: { tenantId, status: 'scheduled', scheduledDate: { lt: now } } }),
    prisma.auditCampaign.count({ where: { tenantId } }),
    prisma.auditCampaign.count({ where: { tenantId, status: 'completed' } }),
  ]);

  const pct = (n: number, d: number) => d > 0 ? round2(n / d * 100) : 100;

  const rows = [
    { area: 'Asset tagging', metric: 'Assets with barcode/RFID', target: '100%', actual: `${assetsWithBarcode}/${totalAssets}`, compliance: pct(assetsWithBarcode, totalAssets) >= 90 ? 'Compliant' : 'At risk', pctCompliant: pct(assetsWithBarcode, totalAssets), notes: '' },
    { area: 'Categorisation', metric: 'Assets with category', target: '100%', actual: `${assetsWithCategory}/${totalAssets}`, compliance: pct(assetsWithCategory, totalAssets) >= 95 ? 'Compliant' : 'At risk', pctCompliant: pct(assetsWithCategory, totalAssets), notes: '' },
    { area: 'Location tracking', metric: 'Assets with assigned site', target: '100%', actual: `${assetsWithSite}/${totalAssets}`, compliance: pct(assetsWithSite, totalAssets) >= 95 ? 'Compliant' : 'At risk', pctCompliant: pct(assetsWithSite, totalAssets), notes: '' },
    { area: 'Warranty mgmt', metric: 'Active warranty coverage', target: '90%', actual: `${warrantyCount - warrantyExpired}/${warrantyCount || 1}`, compliance: warrantyCount > 0 && pct(warrantyCount - warrantyExpired, warrantyCount) >= 90 ? 'Compliant' : 'At risk', pctCompliant: warrantyCount > 0 ? pct(warrantyCount - warrantyExpired, warrantyCount) : 100, notes: warrantyExpired > 0 ? `${warrantyExpired} expired` : '' },
    { area: 'Checkout mgmt', metric: 'On-time returns', target: '95%', actual: `${totalCheckouts - overdueCheckouts}/${totalCheckouts || 1}`, compliance: totalCheckouts > 0 && pct(totalCheckouts - overdueCheckouts, totalCheckouts) >= 95 ? 'Compliant' : 'At risk', pctCompliant: totalCheckouts > 0 ? pct(totalCheckouts - overdueCheckouts, totalCheckouts) : 100, notes: overdueCheckouts > 0 ? `${overdueCheckouts} overdue` : '' },
    { area: 'Maintenance', metric: 'On-time maintenance', target: '90%', actual: `${totalMaintenance - overdueMaintenance}/${totalMaintenance || 1}`, compliance: totalMaintenance > 0 && pct(totalMaintenance - overdueMaintenance, totalMaintenance) >= 90 ? 'Compliant' : 'At risk', pctCompliant: totalMaintenance > 0 ? pct(totalMaintenance - overdueMaintenance, totalMaintenance) : 100, notes: overdueMaintenance > 0 ? `${overdueMaintenance} overdue` : '' },
    { area: 'Auditing', metric: 'Audit completion rate', target: '100%', actual: `${completedAudits}/${totalAudits || 1}`, compliance: totalAudits > 0 && pct(completedAudits, totalAudits) >= 80 ? 'Compliant' : 'At risk', pctCompliant: totalAudits > 0 ? pct(completedAudits, totalAudits) : 100, notes: '' },
  ];

  const areasCompliant = rows.filter(r => r.compliance === 'Compliant').length;
  const areasAtRisk = rows.filter(r => r.compliance !== 'Compliant').length;
  const overallCompliance = rows.length > 0 ? round2(rows.reduce((a, r) => a + r.pctCompliant, 0) / rows.length) : 100;

  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);

  return callReportService(tenantId, {
    report_type: 'compliance-overview', format: opts.format, rows,
    summary: { overallCompliance, areasCompliant, areasAtRisk },
    filters: opts.filters ?? {}, company, tenant_name: tenantName,
  });
}

// ── UTILITY ──────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── EXPORTER REGISTRY ────────────────────────────────────────────────────

const EXPORTERS: Record<string, (tenantId: string, opts: ExportOpts) => Promise<Buffer>> = {
  // Assets
  'fixed-asset-register': exportFixedAssetRegister,
  'depreciation-schedule': exportDepreciationSchedule,
  'asset-aging': exportAssetAging,
  'asset-valuation-summary': exportAssetValuationSummary,
  'asset-movement-history': exportAssetMovementHistory,
  'asset-condition': exportAssetCondition,
  'custom-fields': exportCustomFields,
  // Disposals
  'disposal-register': exportDisposalRegister,
  'disposal-gain-loss': exportDisposalGainLoss,
  'disposal-by-method': exportDisposalByMethod,
  // Audits
  'audit-campaign-summary': exportAuditCampaignSummary,
  'audit-reconciliation': exportAuditReconciliation,
  'audit-scan-log': exportAuditScanLog,
  // Maintenance
  'maintenance-log': exportMaintenanceLog,
  'maintenance-cost-summary': exportMaintenanceCostSummary,
  'maintenance-schedule': exportMaintenanceSchedule,
  // Checkouts
  'checkout-log': exportCheckoutLog,
  'current-checkouts': exportCurrentCheckouts,
  'checkout-history-by-asset': exportCheckoutHistoryByAsset,
  // Licences
  'licence-register': exportLicenceRegister,
  'licence-expiry': exportLicenceExpiry,
  'device-allocation': exportDeviceAllocation,
  // Tenants
  'tenant-register': exportTenantRegister,
  'tenant-activity': exportTenantActivity,
  // Users
  'user-register': exportUserRegister,
  'user-access-report': exportUserAccessReport,
  'user-activity-log': exportUserActivityLog,
  // Exceptions
  'exception-summary': exportExceptionSummary,
  'alert-subscriptions': exportAlertSubscriptions,
  // Company
  'company-profile': exportCompanyProfile,
  'compliance-overview': exportComplianceOverview,
};

export function getExporter(reportType: string) {
  return EXPORTERS[reportType] ?? null;
}

export function getAvailableReportTypes(): string[] {
  return Object.keys(EXPORTERS);
}
