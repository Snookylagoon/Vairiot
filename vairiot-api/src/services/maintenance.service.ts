import { Prisma } from '@prisma/client';

import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { buildOrderBy } from '../lib/sort';

const MAINTENANCE_SORT_KEYS = [
  'createdAt', 'scheduledDate', 'completedDate', 'maintenanceType',
  'vendor', 'cost', 'status', 'workOrderNumber',
  'asset.assetNumber', 'asset.name',
] as const;

export interface MaintenanceCreateInput {
  assetId: string;
  maintenanceType: string;
  vendor?: string;
  workOrderNumber?: string;
  cost?: number;
  description?: string;
  scheduledDate?: string;
  completedDate?: string;
  status?: string;
  notes?: string;
}

const maintenanceSelect = {
  id: true, tenantId: true, assetId: true, maintenanceType: true, vendor: true,
  workOrderNumber: true, cost: true, description: true, scheduledDate: true,
  completedDate: true, status: true, notes: true, createdBy: true,
  createdAt: true, updatedAt: true,
  asset: { select: { id: true, assetNumber: true, name: true } },
} as const;

export async function listMaintenanceEvents(tenantId: string, params: {
  assetId?: string; status?: string; page?: number; pageSize?: number;
  search?: string; sortBy?: string; sortOrder?: string;
}) {
  const { assetId, status, page = 1, pageSize = 25, search, sortBy, sortOrder } = params;
  const where: Prisma.MaintenanceEventWhereInput = {
    tenantId,
    ...(assetId && { assetId }),
    ...(status && { status }),
    ...(search ? {
      OR: [
        { maintenanceType: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { workOrderNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { asset: { assetNumber: { contains: search, mode: 'insensitive' } } },
        { asset: { name: { contains: search, mode: 'insensitive' } } },
      ],
    } : {}),
  };
  const orderBy = buildOrderBy(sortBy, sortOrder, MAINTENANCE_SORT_KEYS, { createdAt: 'desc' as const }) as Prisma.MaintenanceEventOrderByWithRelationInput;
  const [events, total] = await Promise.all([
    prisma.maintenanceEvent.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: maintenanceSelect,
    }),
    prisma.maintenanceEvent.count({ where }),
  ]);
  return { events, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getMaintenanceEvent(tenantId: string, id: string) {
  return prisma.maintenanceEvent.findFirst({ where: { id, tenantId }, select: maintenanceSelect });
}

async function nextWorkOrderNumber(tenantId: string): Promise<string> {
  const last = await prisma.maintenanceEvent.findFirst({
    where: { tenantId, workOrderNumber: { startsWith: 'MAINT-' } },
    orderBy: { workOrderNumber: 'desc' },
    select: { workOrderNumber: true },
  });
  const seq = last?.workOrderNumber ? parseInt(last.workOrderNumber.replace('MAINT-', ''), 10) + 1 : 1;
  return `MAINT-${String(seq).padStart(8, '0')}`;
}

export async function createMaintenanceEvent(tenantId: string, actorId: string, input: MaintenanceCreateInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, tenantId, deletedAt: null } });
  if (!asset) throw new NotFoundError('Asset not found');

  const workOrderNumber = input.workOrderNumber || await nextWorkOrderNumber(tenantId);

  return prisma.maintenanceEvent.create({
    data: {
      tenantId,
      assetId: input.assetId,
      maintenanceType: input.maintenanceType,
      vendor: input.vendor,
      workOrderNumber,
      cost: input.cost != null ? new Prisma.Decimal(input.cost) : undefined,
      description: input.description,
      scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
      completedDate: input.completedDate ? new Date(input.completedDate) : undefined,
      status: input.status ?? 'scheduled',
      notes: input.notes,
      createdBy: actorId,
    },
    select: maintenanceSelect,
  });
}

export async function updateMaintenanceEvent(tenantId: string, id: string, input: Partial<MaintenanceCreateInput>) {
  const evt = await prisma.maintenanceEvent.findFirst({ where: { id, tenantId } });
  if (!evt) throw new NotFoundError('Maintenance event not found');

  return prisma.maintenanceEvent.update({
    where: { id },
    data: {
      ...(input.maintenanceType !== undefined && { maintenanceType: input.maintenanceType }),
      ...(input.vendor !== undefined && { vendor: input.vendor }),
      ...(input.workOrderNumber !== undefined && { workOrderNumber: input.workOrderNumber }),
      ...(input.cost !== undefined && { cost: input.cost != null ? new Prisma.Decimal(input.cost) : null }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.scheduledDate !== undefined && { scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null }),
      ...(input.completedDate !== undefined && { completedDate: input.completedDate ? new Date(input.completedDate) : null }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    select: maintenanceSelect,
  });
}

export async function deleteMaintenanceEvent(tenantId: string, id: string) {
  const evt = await prisma.maintenanceEvent.findFirst({ where: { id, tenantId } });
  if (!evt) throw new NotFoundError('Maintenance event not found');
  await prisma.maintenanceEvent.delete({ where: { id } });
  return { id };
}
