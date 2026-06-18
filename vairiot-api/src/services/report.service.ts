import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { computeDepreciation } from './asset.service';

const assetFinancialSelect = {
  id: true, assetNumber: true, name: true, status: true, condition: true,
  purchaseCost: true, purchaseDate: true, supplier: true,
  freightCost: true, installationCost: true, customsDuties: true,
  otherCapitalizedCosts: true, residualValue: true,
  depreciationMethod: true, usefulLifeMonths: true, depreciationStartDate: true,
  warrantyExpiry: true,
  category: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

export interface ReportFilters {
  categoryId?: string;
  siteId?: string;
  status?: string;
  asOfDate?: string;
}

function baseWhere(tenantId: string, filters: ReportFilters): Prisma.AssetWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(filters.status && { status: filters.status }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.siteId && { siteId: filters.siteId }),
  };
}

export async function depreciationRegister(tenantId: string, filters: ReportFilters = {}) {
  const assets = await prisma.asset.findMany({
    where: { ...baseWhere(tenantId, filters), depreciationStartDate: { not: null } },
    select: assetFinancialSelect,
    orderBy: { assetNumber: 'asc' },
  });

  return assets.map(a => {
    const dep = computeDepreciation(a);
    return {
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category?.name ?? null,
      site: a.site?.name ?? null,
      status: a.status,
      depreciationMethod: a.depreciationMethod,
      usefulLifeMonths: a.usefulLifeMonths,
      depreciationStartDate: a.depreciationStartDate,
      capitalizedCost: dep.capitalizedCost,
      monthlyDepreciation: dep.monthlyDepreciation,
      accumulatedDepreciation: dep.accumulatedDepreciation,
      netBookValue: dep.netBookValue,
      residualValue: Number(a.residualValue ?? 0),
    };
  });
}

export async function fixedAssetRegister(tenantId: string, filters: ReportFilters = {}) {
  const assets = await prisma.asset.findMany({
    where: baseWhere(tenantId, filters),
    select: {
      ...assetFinancialSelect,
      serialNumber: true, modelNumber: true, manufacturer: true,
      barcode: true, rfidTag: true,
      createdAt: true,
    },
    orderBy: { assetNumber: 'asc' },
  });

  return assets.map(a => {
    const dep = computeDepreciation(a);
    return {
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category?.name ?? null,
      site: a.site?.name ?? null,
      location: a.location?.name ?? null,
      status: a.status,
      condition: a.condition,
      serialNumber: a.serialNumber,
      manufacturer: a.manufacturer,
      purchaseDate: a.purchaseDate,
      purchaseCost: Number(a.purchaseCost ?? 0),
      capitalizedCost: dep.capitalizedCost,
      accumulatedDepreciation: dep.accumulatedDepreciation,
      netBookValue: dep.netBookValue,
      registeredDate: a.createdAt,
    };
  });
}

export async function disposalReport(tenantId: string, filters: { from?: string; to?: string } = {}) {
  const where: Prisma.DisposalWhereInput = {
    tenantId,
    ...(filters.from || filters.to ? {
      disposalDate: {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      },
    } : {}),
  };

  const disposals = await prisma.disposal.findMany({
    where,
    include: {
      asset: { select: { assetNumber: true, name: true, category: { select: { name: true } }, site: { select: { name: true } } } },
    },
    orderBy: { disposalDate: 'desc' },
  });

  let totalDisposalValue = 0;
  let totalNBV = 0;
  let totalGainLoss = 0;

  const rows = disposals.map(d => {
    const dv = Number(d.disposalValue ?? 0);
    const nbv = Number(d.netBookValueAtDisposal ?? 0);
    const gl = Number(d.gainLoss ?? 0);
    totalDisposalValue += dv;
    totalNBV += nbv;
    totalGainLoss += gl;
    return {
      assetNumber: d.asset.assetNumber,
      assetName: d.asset.name,
      category: d.asset.category?.name ?? null,
      site: d.asset.site?.name ?? null,
      disposalDate: d.disposalDate,
      disposalMethod: d.disposalMethod,
      disposalValue: dv,
      netBookValueAtDisposal: nbv,
      gainLoss: gl,
      reason: d.disposalReason,
      approvedBy: d.approvedBy,
    };
  });

  return {
    rows,
    totals: {
      count: rows.length,
      totalDisposalValue: Math.round(totalDisposalValue * 100) / 100,
      totalNBV: Math.round(totalNBV * 100) / 100,
      totalGainLoss: Math.round(totalGainLoss * 100) / 100,
    },
  };
}

export async function assetAgingReport(tenantId: string, filters: ReportFilters = {}) {
  const assets = await prisma.asset.findMany({
    where: { ...baseWhere(tenantId, filters), purchaseDate: { not: null } },
    select: {
      assetNumber: true, name: true, status: true,
      purchaseDate: true, purchaseCost: true,
      category: { select: { name: true } },
      site: { select: { name: true } },
    },
    orderBy: { purchaseDate: 'asc' },
  });

  const now = new Date();
  const buckets = { '0-1y': 0, '1-3y': 0, '3-5y': 0, '5-10y': 0, '10y+': 0 };

  const rows = assets.map(a => {
    const pd = a.purchaseDate!;
    const ageMonths = (now.getFullYear() - pd.getFullYear()) * 12 + (now.getMonth() - pd.getMonth());
    const ageYears = ageMonths / 12;

    if (ageYears < 1) buckets['0-1y']++;
    else if (ageYears < 3) buckets['1-3y']++;
    else if (ageYears < 5) buckets['3-5y']++;
    else if (ageYears < 10) buckets['5-10y']++;
    else buckets['10y+']++;

    return {
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category?.name ?? null,
      site: a.site?.name ?? null,
      status: a.status,
      purchaseDate: a.purchaseDate,
      purchaseCost: Number(a.purchaseCost ?? 0),
      ageMonths,
    };
  });

  return { rows, buckets, totalAssets: rows.length };
}

export async function maintenanceCostReport(tenantId: string, filters: { from?: string; to?: string; assetId?: string } = {}) {
  const where: Prisma.MaintenanceEventWhereInput = {
    tenantId,
    status: 'completed',
    ...(filters.assetId && { assetId: filters.assetId }),
    ...(filters.from || filters.to ? {
      completedDate: {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      },
    } : {}),
  };

  const events = await prisma.maintenanceEvent.findMany({
    where,
    select: {
      id: true, maintenanceType: true, vendor: true, cost: true,
      scheduledDate: true, completedDate: true,
      asset: { select: { assetNumber: true, name: true, category: { select: { name: true } } } },
    },
    orderBy: { completedDate: 'desc' },
  });

  let totalCost = 0;
  const rows = events.map(e => {
    const cost = Number(e.cost ?? 0);
    totalCost += cost;
    return {
      assetNumber: e.asset.assetNumber,
      assetName: e.asset.name,
      category: e.asset.category?.name ?? null,
      maintenanceType: e.maintenanceType,
      vendor: e.vendor,
      cost,
      completedDate: e.completedDate,
    };
  });

  return { rows, totalCost: Math.round(totalCost * 100) / 100, totalEvents: rows.length };
}
