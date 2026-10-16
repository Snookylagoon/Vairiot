import { Prisma } from '@prisma/client';
import type { AssetClassInput, AssetClassUpdateInput } from 'vairiot-shared';

import { ConflictError, NotFoundError } from '../lib/errors';
import { money } from '../lib/money';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';
import { recomputeClassRecognition } from './recognition.service';

// The tenant's IPSAS asset classes (Phase 2, S2.1): the policies the
// Accounting Policy Manual sets per class. Changes are audited, and a new
// threshold is applied at once to the class's assets.

/** Classes with how many assets and categories use each. */
export async function listAssetClasses(tenantId: string) {
  const classes = await prisma.assetClass.findMany({
    where: { tenantId },
    orderBy: { code: 'asc' },
    include: { _count: { select: { assets: { where: { deletedAt: null } }, categories: true } } },
  });
  return classes.map(({ _count, ...c }) => ({ ...c, assetCount: _count.assets, categoryCount: _count.categories }));
}

function duplicateCode(err: unknown, code: string | undefined): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError(`An asset class with code ${code} already exists`, 'DUPLICATE_CODE');
  }
  throw err;
}

export async function createAssetClass(tenantId: string, actorId: string, input: AssetClassInput) {
  const created = await prisma.assetClass.create({ data: { ...input, tenantId } }).catch((e) => duplicateCode(e, input.code));
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'asset_class', entityId: created.id, action: 'created',
    after: created as unknown as Prisma.InputJsonValue,
  });
  return created;
}

export async function updateAssetClass(tenantId: string, actorId: string, id: string, input: AssetClassUpdateInput) {
  const before = await prisma.assetClass.findFirst({ where: { id, tenantId } });
  if (!before) throw new NotFoundError('Asset class not found');
  const updated = await prisma.assetClass.update({ where: { id }, data: input }).catch((e) => duplicateCode(e, input.code));
  if (input.capitalisationThreshold !== undefined && !money(before.capitalisationThreshold).equals(money(updated.capitalisationThreshold))) {
    await recomputeClassRecognition(tenantId, id);
  }
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'asset_class', entityId: id, action: 'updated',
    before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}
