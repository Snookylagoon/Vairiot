import { Prisma } from '@prisma/client';

import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAssetChanges } from './asset-change-events.service';
import { afterAssetWrite } from './component.service';
import { dispatchWebhookEvent } from './webhook.service';

export interface TransferCreateInput {
  assetId: string;
  fromSiteId?: string;
  toSiteId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  fromCustodian?: string;
  toCustodian?: string;
  transferDate?: string;
  reason?: string;
  approvedBy?: string;
}

const transferSelect = {
  id: true, tenantId: true, assetId: true,
  fromSiteId: true, toSiteId: true, fromLocationId: true, toLocationId: true,
  fromCustodian: true, toCustodian: true, transferDate: true,
  reason: true, approvedBy: true, createdBy: true, createdAt: true,
  asset: { select: { id: true, assetNumber: true, name: true } },
} as const;

export async function listTransfers(tenantId: string, params: {
  assetId?: string; page?: number; pageSize?: number;
}) {
  const { assetId, page = 1, pageSize = 25 } = params;
  const where: Prisma.TransferWhereInput = {
    tenantId,
    ...(assetId && { assetId }),
  };
  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: transferSelect,
    }),
    prisma.transfer.count({ where }),
  ]);
  return { transfers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function createTransfer(tenantId: string, actorId: string, input: TransferCreateInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, tenantId, deletedAt: null } });
  if (!asset) throw new NotFoundError('Asset not found');

  const transfer = await prisma.$transaction(async (tx) => {
    const created = await tx.transfer.create({
      data: {
        tenantId,
        assetId: input.assetId,
        fromSiteId: input.fromSiteId,
        toSiteId: input.toSiteId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        fromCustodian: input.fromCustodian ?? asset.custodian ?? undefined,
        toCustodian: input.toCustodian,
        transferDate: input.transferDate ? new Date(input.transferDate) : new Date(),
        reason: input.reason,
        approvedBy: input.approvedBy,
        createdBy: actorId,
      },
      select: transferSelect,
    });

    const assetUpdate: Prisma.AssetUpdateInput = {};
    if (input.toSiteId) assetUpdate.site = { connect: { id: input.toSiteId } };
    if (input.toLocationId) assetUpdate.location = { connect: { id: input.toLocationId } };
    // The transfer's custodian becomes the asset's (stage 2.7).
    if (input.toCustodian?.trim()) assetUpdate.custodian = input.toCustodian.trim().slice(0, 120);
    if (Object.keys(assetUpdate).length > 0) {
      await tx.asset.update({ where: { id: input.assetId }, data: assetUpdate });
    }

    return created;
  });

  // A parent's components follow it where they were still with it (S2.2).
  const moved = await prisma.asset.findUniqueOrThrow({ where: { id: input.assetId } });
  await recordAssetChanges(tenantId, input.assetId, actorId, asset, moved);
  await afterAssetWrite(tenantId, moved, asset, actorId);
  void dispatchWebhookEvent(tenantId, 'transfer.created', transfer).catch(() => {});
  return transfer;
}
