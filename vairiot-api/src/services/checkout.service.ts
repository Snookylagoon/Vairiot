import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';

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
  });
}

export async function listActiveCheckouts(tenantId: string) {
  return prisma.checkout.findMany({
    where: { tenantId, checkedInAt: null },
    include: { asset: { select: { id: true, assetNumber: true, name: true } } },
    orderBy: { checkedOutAt: 'desc' },
  });
}

export async function getOverdueCheckouts(tenantId: string) {
  return prisma.checkout.findMany({
    where: { tenantId, checkedInAt: null, expectedReturn: { lt: new Date() } },
    include: { asset: { select: { id: true, assetNumber: true, name: true } } },
    orderBy: { expectedReturn: 'asc' },
  });
}
