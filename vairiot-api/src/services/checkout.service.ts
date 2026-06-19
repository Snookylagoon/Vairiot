import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';
import { buildOrderBy } from '../lib/sort';

export interface CheckoutInput {
  assetId: string;
  custodianId: string;
  expectedReturn?: string;
  notes?: string;
}

export async function checkoutAsset(tenantId: string, actorId: string, input: CheckoutInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, tenantId } });
  if (!asset) throw new NotFoundError('Asset not found');
  const active = await prisma.checkout.findFirst({ where: { assetId: input.assetId, checkedInAt: null } });
  if (active) throw new ConflictError('Asset is already checked out', 'ALREADY_CHECKED_OUT');
  const checkout = await prisma.checkout.create({
    data: {
      tenantId,
      assetId:        input.assetId,
      custodianId:    input.custodianId,
      checkedOutBy:   actorId,
      expectedReturn: input.expectedReturn ? new Date(input.expectedReturn) : undefined,
      notes:          input.notes,
    },
    include: { asset: true },
  });
  await prisma.auditEvent.create({
    data: { tenantId, actorId, entityType: 'asset', entityId: input.assetId, action: 'checked_out', metadata: { custodianId: input.custodianId } },
  });
  return checkout;
}

export async function checkinAsset(tenantId: string, actorId: string, assetId: string) {
  const checkout = await prisma.checkout.findFirst({ where: { assetId, tenantId, checkedInAt: null } });
  if (!checkout) throw new ConflictError('Asset is not currently checked out', 'NOT_CHECKED_OUT');
  const updated = await prisma.checkout.update({
    where: { id: checkout.id },
    data: { checkedInAt: new Date(), checkedInBy: actorId },
    include: { asset: true },
  });
  await prisma.auditEvent.create({
    data: { tenantId, actorId, entityType: 'asset', entityId: assetId, action: 'checked_in', metadata: { checkoutId: checkout.id } },
  });
  return updated;
}

export async function getCheckoutHistory(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId } });
  if (!asset) throw new NotFoundError('Asset not found');
  return prisma.checkout.findMany({
    where: { assetId, tenantId },
    orderBy: { checkedOutAt: 'desc' },
    take: 500,
  });
}

const CHECKOUT_SORT_KEYS = ['checkedOutAt', 'expectedReturn', 'custodianId', 'asset.assetNumber', 'asset.name'] as const;

interface CheckoutListOpts {
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

function checkoutSearchWhere(search: string | undefined) {
  if (!search) return {};
  return {
    OR: [
      { custodianId: { contains: search, mode: 'insensitive' as const } },
      { asset: { assetNumber: { contains: search, mode: 'insensitive' as const } } },
      { asset: { name: { contains: search, mode: 'insensitive' as const } } },
    ],
  };
}

export async function listActiveCheckouts(tenantId: string, opts: CheckoutListOpts = {}) {
  return prisma.checkout.findMany({
    where: { tenantId, checkedInAt: null, ...checkoutSearchWhere(opts.search) },
    include: { asset: { select: { id: true, assetNumber: true, name: true } } },
    orderBy: buildOrderBy(opts.sortBy, opts.sortOrder, CHECKOUT_SORT_KEYS, { checkedOutAt: 'desc' as const }) as Prisma.CheckoutOrderByWithRelationInput,
    take: 1000,
  });
}

export async function getOverdueCheckouts(tenantId: string, opts: CheckoutListOpts = {}) {
  return prisma.checkout.findMany({
    where: { tenantId, checkedInAt: null, expectedReturn: { lt: new Date() }, ...checkoutSearchWhere(opts.search) },
    include: { asset: { select: { id: true, assetNumber: true, name: true } } },
    orderBy: buildOrderBy(opts.sortBy, opts.sortOrder, CHECKOUT_SORT_KEYS, { expectedReturn: 'asc' as const }) as Prisma.CheckoutOrderByWithRelationInput,
    take: 1000,
  });
}
