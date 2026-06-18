import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface AssetCreateInput {
  name: string; description?: string; categoryId?: string; siteId?: string;
  locationId?: string; serialNumber?: string; modelNumber?: string;
  manufacturer?: string; barcode?: string; rfidTag?: string;
  purchaseDate?: string; purchaseCost?: number; supplier?: string;
  warrantyExpiry?: string; notes?: string; condition?: string; status?: string; customFields?: Record<string, unknown>;
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
}

function buildAssetWhere(tenantId: string, params: AssetListParams): Prisma.AssetWhereInput {
  const { search, categoryId, siteId, status, condition } = params;
  return {
    tenantId,
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

export async function listAssets(tenantId: string, params: AssetListParams) {
  const { sortBy, sortOrder, page = 1, pageSize = 50 } = params;
  const where = buildAssetWhere(tenantId, params);
  const col = (sortBy && SORTABLE_COLUMNS[sortBy]) || 'createdAt';
  const dir = sortOrder === 'asc' ? 'asc' : 'desc';
  const [assets, total] = await Promise.all([
    prisma.asset.findMany({ where, include: { category: true, site: true, location: true }, orderBy: { [col]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.asset.count({ where }),
  ]);
  return { assets, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAssetStats(tenantId: string) {
  const [byStatus, byCondition, total] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'],    where: { tenantId }, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ['condition'], where: { tenantId }, _count: { _all: true } }),
    prisma.asset.count({ where: { tenantId } }),
  ]);
  return {
    total,
    byStatus:    Object.fromEntries(byStatus.map(r    => [r.status,    r._count._all])),
    byCondition: Object.fromEntries(byCondition.map(r => [r.condition, r._count._all])),
  };
}

export async function getAsset(tenantId: string, id: string) {
  const asset = await prisma.asset.findFirst({ where: { id, tenantId }, include: { category: true, site: true, location: true } });
  if (!asset) throw new Error('NOT_FOUND');
  return asset;
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
      purchaseCost: input.purchaseCost != null ? new Prisma.Decimal(input.purchaseCost) : undefined,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
      warrantyExpiry: input.warrantyExpiry ? new Date(input.warrantyExpiry) : undefined,
      categoryId: input.categoryId,
      siteId:     input.siteId,
      locationId: input.locationId,
    },
    include: { category: true, site: true, location: true },
  });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: asset.id, action: 'created', after: asset as unknown as Prisma.InputJsonValue } });
  return asset;
}

export async function updateAsset(tenantId: string, id: string, actorId: string, input: Partial<AssetCreateInput>) {
  const existing = await prisma.asset.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');
  const updated = await prisma.asset.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.serialNumber !== undefined && { serialNumber: input.serialNumber }),
      ...(input.modelNumber !== undefined && { modelNumber: input.modelNumber }),
      ...(input.manufacturer !== undefined && { manufacturer: input.manufacturer }),
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      ...(input.rfidTag !== undefined && { rfidTag: input.rfidTag }),
      ...(input.supplier !== undefined && { supplier: input.supplier }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.condition !== undefined && { condition: input.condition }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.purchaseCost != null && { purchaseCost: new Prisma.Decimal(input.purchaseCost) }),
      ...(input.purchaseDate !== undefined && { purchaseDate: new Date(input.purchaseDate) }),
      ...(input.warrantyExpiry !== undefined && { warrantyExpiry: new Date(input.warrantyExpiry) }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId ?? null }),
      ...(input.siteId     !== undefined && { siteId:     input.siteId     ?? null }),
      ...(input.locationId !== undefined && { locationId: input.locationId ?? null }),
    },
    include: { category: true, site: true, location: true },
  });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: id, action: 'updated', before: existing as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue } });
  return updated;
}

export async function deleteAsset(tenantId: string, id: string, actorId: string) {
  const existing = await prisma.asset.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');
  await prisma.asset.delete({ where: { id } });
  await prisma.auditEvent.create({ data: { tenantId, actorId, entityType: 'asset', entityId: id, action: 'deleted', before: existing as unknown as Prisma.InputJsonValue } });
}

export async function listAssetsForExport(tenantId: string, params: Omit<AssetListParams, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'> = {}) {
  const where = buildAssetWhere(tenantId, params);
  return prisma.asset.findMany({
    where,
    include: { category: true, site: true, location: true },
    orderBy: { assetNumber: 'asc' },
  });
}

export async function getAssetByTag(tenantId: string, tag: string) {
  const asset = await prisma.asset.findFirst({ where: { tenantId, OR: [{ rfidTag: tag }, { barcode: tag }] }, include: { category: true, site: true, location: true } });
  if (!asset) throw new Error('NOT_FOUND');
  return asset;
}
