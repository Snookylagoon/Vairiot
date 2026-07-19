import { Job, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import {
  QUEUE_NAMES,
  SchedulerTickJob,
  AlertDigestJob,
  UpcomingMaintenanceItem,
} from '../queues';

const prisma = new PrismaClient();

// How far ahead the digest looks for upcoming maintenance.
const MAINTENANCE_LOOKAHEAD_DAYS = 7;

// Re-send guard: a subscription is skipped if its lastSentAt is within this
// window, so a re-fired tick (worker restart, manual trigger) can't double-send.
const RESEND_GUARD_HOURS = { daily: 20, weekly: 6 * 24 } as const;

let digestQueue: Queue<AlertDigestJob> | null = null;

export function setDigestQueue(q: Queue<AlertDigestJob>): void {
  digestQueue = q;
}

interface TenantExceptionCounts {
  missing_documents:   number;
  overdue_maintenance: number;
  expired_warranty:    number;
  unlocated_assets:    number;
}

async function countExceptions(tenantId: string): Promise<TenantExceptionCounts> {
  const now = new Date();
  const [missingDocuments, overdueMaintenance, expiredWarranty, unlocatedAssets] = await Promise.all([
    prisma.asset.count({
      where: { tenantId, deletedAt: null, status: { not: 'disposed' }, documents: { none: {} } },
    }),
    prisma.maintenanceEvent.count({
      where: { tenantId, status: 'scheduled', scheduledDate: { lt: now } },
    }),
    prisma.asset.count({
      where: { tenantId, deletedAt: null, status: { not: 'disposed' }, warrantyExpiry: { lt: now } },
    }),
    prisma.asset.count({
      where: { tenantId, deletedAt: null, status: { not: 'disposed' }, siteId: null },
    }),
  ]);
  return {
    missing_documents:   missingDocuments,
    overdue_maintenance: overdueMaintenance,
    expired_warranty:    expiredWarranty,
    unlocated_assets:    unlocatedAssets,
  };
}

async function upcomingMaintenance(tenantId: string): Promise<UpcomingMaintenanceItem[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + MAINTENANCE_LOOKAHEAD_DAYS * 24 * 3600 * 1000);
  const events = await prisma.maintenanceEvent.findMany({
    where: { tenantId, status: 'scheduled', scheduledDate: { lte: horizon } },
    orderBy: { scheduledDate: 'asc' },
    take: 25,
    select: {
      maintenanceType: true,
      scheduledDate: true,
      asset: { select: { assetNumber: true, name: true } },
    },
  });
  return events
    .filter((e) => e.scheduledDate !== null)
    .map((e) => ({
      assetNumber:     e.asset.assetNumber,
      assetName:       e.asset.name,
      maintenanceType: e.maintenanceType,
      scheduledDate:   e.scheduledDate!.toISOString().slice(0, 10),
      overdue:         e.scheduledDate! < now,
    }));
}

export async function handleSchedulerTick(job: Job<SchedulerTickJob>): Promise<void> {
  const { frequency } = job.data;
  if (!digestQueue) {
    throw new Error('Digest queue not initialised — setDigestQueue() must be called at startup');
  }

  const guardMs = RESEND_GUARD_HOURS[frequency] * 3600 * 1000;
  const cutoff = new Date(Date.now() - guardMs);

  const subs = await prisma.alertSubscription.findMany({
    where: {
      active: true,
      frequency,
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: cutoff } }],
    },
  });
  if (subs.length === 0) {
    logger.info(`notification-scheduler(${frequency}): no due subscriptions`);
    return;
  }

  // Group per tenant+user — one digest email per user covering all their types.
  const byUser = new Map<string, typeof subs>();
  for (const sub of subs) {
    const key = `${sub.tenantId}:${sub.userId}`;
    const list = byUser.get(key) ?? [];
    list.push(sub);
    byUser.set(key, list);
  }

  // Exception counts are per tenant — cache across users of the same tenant.
  const countsCache = new Map<string, TenantExceptionCounts>();
  const maintCache = new Map<string, UpcomingMaintenanceItem[]>();
  let enqueued = 0;
  let skippedEmpty = 0;

  for (const userSubs of byUser.values()) {
    const { tenantId, userId } = userSubs[0];

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, active: true },
    });
    if (!user || !user.active) continue;

    let counts = countsCache.get(tenantId);
    if (!counts) {
      counts = await countExceptions(tenantId);
      countsCache.set(tenantId, counts);
    }

    const types = userSubs.map((s) => s.exceptionType);
    const subscribedCounts: Record<string, number> = {};
    for (const t of types) {
      subscribedCounts[t] = counts[t as keyof TenantExceptionCounts] ?? 0;
    }

    let maint: UpcomingMaintenanceItem[] | undefined;
    if (types.includes('overdue_maintenance')) {
      maint = maintCache.get(tenantId);
      if (!maint) {
        maint = await upcomingMaintenance(tenantId);
        maintCache.set(tenantId, maint);
      }
    }

    // Nothing to report → no email, and no lastSentAt update so the next tick
    // re-evaluates from scratch.
    const hasContent =
      Object.values(subscribedCounts).some((n) => n > 0) || (maint?.length ?? 0) > 0;
    if (!hasContent) {
      skippedEmpty++;
      continue;
    }

    await digestQueue.add('send', {
      tenantId,
      userId,
      recipientEmail: user.email,
      recipientName:  user.name,
      frequency,
      exceptionTypes: types,
      counts: subscribedCounts,
      upcomingMaintenance: maint,
    }, { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });

    await prisma.alertSubscription.updateMany({
      where: { id: { in: userSubs.map((s) => s.id) } },
      data: { lastSentAt: new Date() },
    });
    enqueued++;
  }

  logger.info(
    `notification-scheduler(${frequency}): ${enqueued} digest(s) enqueued, ` +
    `${skippedEmpty} skipped (nothing to report), ${byUser.size} user(s) considered`,
  );
}
