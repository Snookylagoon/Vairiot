import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';

export interface AssetCreateInput {
  name: string; description?: string; categoryId?: string; siteId?: string;
  locationId?: string; serialNumber?: string; modelNumber?: string;
  manufacturer?: string; barcode?: string; rfidTag?: string;
  purchaseDate?: string; purchaseCost?: number; supplier?: string;
  warrantyExpiry?: string; notes?: string; condition?: string; status?: string;
  customFields?: Record<string, unknown>;
  // Expanded financial
  purchaseOrderNumber?: string; invoiceNumber?: string; invoiceDate?: string;
  receiptDate?: string; capitalizationDate?: string;
  freightCost?: number; installationCost?: number; customsDuties?: number;
  otherCapitalizedCosts?: number; residualValue?: number;
  // Depreciation
  depreciationMethod?: string; usefulLifeMonths?: number; depreciationStartDate?: string;
}

function toDecimal(v: number | undefined | null): Prisma.Decimal | undefined {
  return v != null ? new Prisma.Decimal(v) : undefined;
}

function toDate(v: string | undefined | null): Date | undefined {
  return v ? new Date(v) : undefined;
}

async function nextAssetNumber(tenantId: string): Promise<string> {
  const count = await prisma.asset.count({ where: { tenantId } });
  return 'AST-' + String(count + 1).padStart(6, '0');
}

const SORTABLE_COLUMNS: Record<string, string> = {
  assetNumber: 'assetNumber', name: 'name', status: 'status', condition: 'condition',
  createdAt: 'createdAt', purchaseCost: 'purchaseCost', purchaseDate: 'purchaseDate',
};

export interface AssetListParams {
  search?: string; categoryId?: string; siteId?: string; status?: string; condition?: string;
  sortBy?: string; sortOrder?: string; page?: number; pageSize?: number;
  includeDeleted?: boolean;
}

function buildAssetWhere(tenantId: string, params: AssetListParams): Prisma.AssetWhereInput {
  const { search, categoryId, siteId, status, condition, includeDeleted } = params;
  return {
    tenantId,
    ...(!includeDeleted && { deletedAt: null }),
    ...(status && { status }),
    ...(condition && { condition }),
    ...(categoryId && { categoryId }),
    ...(siteId && { siteId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { assetNumber: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { rfidTag: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };
}

const assetInclude = { category: true, site: true, location: true, disposal: true } as const;

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
}) {
  const purchase = Number(asset.purchaseCost ?? 0);
  const freight = Number(asset.freightCost ?? 0);
  const installation = Number(asset.installationCost ?? 0);
  const customs = Number(asset.customsDuties ?? 0);
  const other = Number(asset.otherCapitalizedCosts ?? 0);
  const capitalizedCost = purchase + freight + installation + customs + other;
  const residual = Number(asset.residualValue ?? 0);

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

function enrichAssetWithDepreciation(asset: any) {
  const depreciation = computeDepreciation(asset);
  return { ...asset, depreciation };
}

export async function listAssets(tenantId: string, params: AssetListParams) {
  const { sortBy, sortOrder, page = 1, pageSize = 50 } = params;
  const where = buildAssetWhere(tenantId, params);
  const col = (sortBy && SORTABLE_COLUMNS[sortBy]) || 'createdAt';
  const dir = sortOrder === 'asc' ? 'asc' : 'desc';
  const [assets, total] = await Promise.all([
    prisma.asset.findMany({ where, include: assetInclude, orderBy: { [col]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.asset.count({ where }),
  ]);
  return { assets: assets.map(enrichAssetWithDepreciation), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAssetStats(tenantId: string) {
  const notDeleted = { tenantId, deletedAt: null };
  const [byStatus, byCondition, total, allAssets, byCategory, bySite] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'],    where: notDeleted, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ['condition'], where: notDeleted, _count: { _all: true } }),
    prisma.asset.count({ where: notDeleted }),
    prisma.asset.findMany({
      where: notDeleted,
      select: {
        purchaseCost: true, freightCost: true, installationCost: true,
        customsDuties: true, otherCapitalizedCosts: true, residualValue: true,
        usefulLifeMonths: true, depreciationStartDate: true, depreciationMethod: true,
        categoryId: true, siteId: true, createdAt: true,
      },
    }),
    prisma.asset.groupBy({ by: ['categoryId'], where: { ...notDeleted, categoryId: { not: null } }, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ['siteId'],     where: { ...notDeleted, siteId: { not: null } },     _count: { _all: true } }),
  ]);

  const [categories, sites] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.site.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const catNames = new Map(categories.map(c => [c.id, c.name]));
  const siteNames = new Map(sites.map(s => [s.id, s.name]));

  let totalAssetValue = 0;
  let totalNetBookValue = 0;
  let totalMonthlyDepreciation = 0;
  const valueByCat: Record<string, number> = {};
  const valueBySite: Record<string, number> = {};

  const depCache = new Array<ReturnType<typeof computeDepreciation>>(allAssets.length);
  for (let i = 0; i < allAssets.length; i++) {
    const a = allAssets[i];
    const dep = computeDepreciation(a);
    depCache[i] = dep;
    totalAssetValue += dep.capitalizedCost;
    totalNetBookValue += dep.netBookValue;
    totalMonthlyDepreciation += dep.monthlyDepreciation;

    if (a.categoryId) {
      const name = catNames.get(a.categoryId) ?? 'Other';
      valueByCat[name] = (valueByCat[name] ?? 0) + dep.netBookValue;
    }
    if (a.siteId) {
      const name = siteNames.get(a.siteId) ?? 'Other';
      valueBySite[name] = (valueBySite[name] ?? 0) + dep.netBookValue;
    }
  }

  const now = new Date();
  const monthlyTrend: Array<{ month: string; count: number; value: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    let count = 0;
    let monthValue = 0;
    for (let j = 0; j < allAssets.length; j++) {
      const a = allAssets[j];
      if (a.createdAt >= start && a.createdAt < end) {
        count++;
        monthValue += depCache[j].capitalizedCost;
      }
    }
    monthlyTrend.push({ month: label, count, value: Math.round(monthValue * 100) / 100 });
  }

  return {
    total,
    byStatus:    Object.fromEntries(byStatus.map(r    => [r.status,    r._count._all])),
    byCondition: Object.fromEntries(byCondition.map(r => [r.condition, r._count._all])),
    byCategory:  byCategory.map(r => ({ name: catNames.get(r.categoryId!) ?? 'Unknown', count: r._count._all })),
    bySite:      bySite.map(r => ({ name: siteNames.get(r.siteId!) ?? 'Unknown', count: r._count._all })),
    valueByCat:  Object.entries(valueByCat).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    valueBySite: Object.entries(valueBySite).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    monthlyTrend,
    totalAssetValue: Math.round(totalAssetValue * 100) / 100,
    totalNetBookValue: Math.round(totalNetBookValue * 100) / 100,
    totalMonthlyDepreciation: Math.round(totalMonthlyDepreciation * 100) / 100,
  };
}

export async function getAsset(tenantId: string, id: string) {
  const asset = await prisma.asset.findFirst({ where: { id, tenantId }, include: assetInclude });
  if (!asset) throw new NotFoundError('Asset not found');
  return enrichAssetWithDepreciation(asset);
}

export async function createAsset(tenantId: string, actorId: string, input: AssetCreateInput) {
  const assetNumber = await nextAssetNumber(tenantId);
  const asset = await prisma.asset.create({
    data: {
      tenantId, assetNumber, name: input.name, description: input.description,
      serialNumber: input.serialNumber, modelNumber: input.modelNumber, manufacturer: input.manufacturer,
      barcode: input.barcode, rfidTag: input.rfidTag, supplier: input.supplier, notes: input.notes,
      condition: input.condition, status: input.status,
      customFields: (input.customFields ?? undefined) as Prisma.InputJsonValue | undefined,
      purchaseCost: toDecimal(input.purchaseCost),
      purchaseDate: toDate(input.purchaseDate),
      warrantyExpiry: toDate(input.warrantyExpiry),
      // Expanded financial
      purchaseOrderNumber: input.purchaseOrderNumber,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: toDate(input.invoiceDate),
      receiptDate: toDate(input.receiptDate),
      capitalizationDate: toDate(input.capitalizationDate),
      freightCost: toDecimal(input.freightCost),
      installationCost: toDecimal(input.installationCost),
      customsDuties: toDecimal(input.customsDuties),
      otherCapitalizedCosts: toDecimal(input.otherCapitalizedCosts),
      residualValue: toDecimal(input.residualValue),
      // Depreciation
      depreciationMethod: input.depreciationMethod,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationStartDate: toDate(input.depreciationStartDate),
      categoryId: input.categoryId,
      siteId:     input.siteId,
      locationId: input.locationId,
    },
    include: assetInclude,
  });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: asset.id, action: 'created', after: asset as unknown as Prisma.InputJsonValue } });
  return enrichAssetWithDepreciation(asset);
}

const STRING_FIELDS = [
  'name', 'description', 'serialNumber', 'modelNumber', 'manufacturer',
  'barcode', 'rfidTag', 'supplier', 'notes', 'condition', 'status',
  'purchaseOrderNumber', 'invoiceNumber', 'depreciationMethod',
] as const;

const DECIMAL_FIELDS = [
  'purchaseCost', 'freightCost', 'installationCost', 'customsDuties',
  'otherCapitalizedCosts', 'residualValue',
] as const;

const DATE_FIELDS = [
  'purchaseDate', 'warrantyExpiry', 'invoiceDate', 'receiptDate',
  'capitalizationDate', 'depreciationStartDate',
] as const;

const REF_FIELDS = ['categoryId', 'siteId', 'locationId'] as const;

export async function updateAsset(tenantId: string, id: string, actorId: string, input: Partial<AssetCreateInput>) {
  const existing = await prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Asset not found');

  const data: Record<string, any> = {};
  for (const f of STRING_FIELDS) if (input[f] !== undefined) data[f] = input[f];
  for (const f of DECIMAL_FIELDS) if (input[f] !== undefined) data[f] = input[f] ? new Prisma.Decimal(input[f]!) : null;
  for (const f of DATE_FIELDS) if (input[f] !== undefined) data[f] = input[f] ? new Date(input[f]!) : null;
  for (const f of REF_FIELDS) if (input[f] !== undefined) data[f] = input[f] ?? null;
  if (input.usefulLifeMonths !== undefined) data.usefulLifeMonths = input.usefulLifeMonths;

  const updated = await prisma.asset.update({
    where: { id },
    data,
    include: assetInclude,
  });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: id, action: 'updated', before: existing as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue } });
  return enrichAssetWithDepreciation(updated);
}

export async function deleteAsset(tenantId: string, id: string, actorId: string) {
  const existing = await prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Asset not found');
  await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: id, action: 'archived', before: existing as unknown as Prisma.InputJsonValue } });
}

export interface DisposalInput {
  disposalDate: string;
  disposalMethod: string;
  disposalValue?: number;
  disposalReason?: string;
  approvedBy?: string;
  notes?: string;
}

export async function disposeAsset(tenantId: string, id: string, actorId: string, input: DisposalInput) {
  const asset = await prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null }, include: assetInclude });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'disposed') throw new ConflictError('Asset is already disposed', 'ALREADY_DISPOSED');

  const dep = computeDepreciation(asset);
  const gainLoss = input.disposalValue != null
    ? input.disposalValue - dep.netBookValue
    : undefined;

  const [disposal, updated] = await prisma.$transaction([
    prisma.disposal.create({
      data: {
        tenantId,
        assetId: id,
        disposalDate: new Date(input.disposalDate),
        disposalMethod: input.disposalMethod,
        disposalValue: toDecimal(input.disposalValue),
        disposalReason: input.disposalReason,
        netBookValueAtDisposal: new Prisma.Decimal(dep.netBookValue),
        gainLoss: gainLoss != null ? new Prisma.Decimal(gainLoss) : undefined,
        approvedBy: input.approvedBy,
        notes: input.notes,
        createdBy: actorId,
      },
    }),
    prisma.asset.update({ where: { id }, data: { status: 'disposed' }, include: assetInclude }),
  ]);

  await prisma.auditEvent.create({
    data: {
      tenantId, actorId, entityType: 'asset', entityId: id, action: 'disposed',
      before: asset as unknown as Prisma.InputJsonValue,
      after: { ...updated, disposal } as unknown as Prisma.InputJsonValue,
    },
  });

  return enrichAssetWithDepreciation({ ...updated, disposal });
}

export async function listAssetsForExport(tenantId: string, params: Omit<AssetListParams, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'> = {}) {
  const where = buildAssetWhere(tenantId, params);
  const assets = await prisma.asset.findMany({
    where,
    include: assetInclude,
    orderBy: { assetNumber: 'asc' },
    take: 10_000,
  });
  return assets.map(enrichAssetWithDepreciation);
}

export async function getAssetByTag(tenantId: string, tag: string) {
  const asset = await prisma.asset.findFirst({
    where: { tenantId, deletedAt: null, OR: [{ rfidTag: tag }, { barcode: tag }] },
    include: assetInclude,
  });
  if (!asset) throw new NotFoundError('No asset found for this tag');
  return enrichAssetWithDepreciation(asset);
}
