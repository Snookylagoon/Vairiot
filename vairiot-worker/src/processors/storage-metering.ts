import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { logger } from '../logger';

const prisma = new PrismaClient();

/**
 * Nightly per-tenant usage snapshot: storage consumed by photos/documents plus
 * asset and user counts, bucketed by UTC day. Idempotent — re-running a tick
 * overwrites today's bucket. Feeds future tier storage caps / billing.
 */
export async function handleStorageMetering(job: Job): Promise<void> {
  const today = new Date();
  const bucket = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let written = 0;

  for (const { id: tenantId } of tenants) {
    const [photos, documents, assetCount, userCount] = await Promise.all([
      prisma.photo.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
      prisma.document.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
      prisma.asset.count({ where: { tenantId, deletedAt: null } }),
      prisma.user.count({ where: { tenantId, active: true } }),
    ]);

    const data = {
      photoBytes:    BigInt(photos._sum.sizeBytes ?? 0),
      documentBytes: BigInt(documents._sum.sizeBytes ?? 0),
      photoCount:    photos._count._all,
      documentCount: documents._count._all,
      assetCount,
      userCount,
    };

    await prisma.tenantUsage.upsert({
      where: { tenantId_date: { tenantId, date: bucket } },
      update: data,
      create: { tenantId, date: bucket, ...data },
    });
    written++;
  }

  logger.info(`storage-metering job ${job.id}: snapshot written for ${written} tenant(s)`);
}
