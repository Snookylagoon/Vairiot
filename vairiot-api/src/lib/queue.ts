import { Queue, ConnectionOptions } from 'bullmq';
import { logger } from './logger';

export const QUEUE_NAMES = {
  auditComplete: 'audit-complete',
} as const;

export interface AuditCompleteJob {
  tenantId:       string;
  campaignId:     string;
  campaignName:   string;
  recipientEmail: string;
  recipientName?: string;
  summary: {
    totalExpected: number;
    totalScanned:  number;
    found:         number;
    missingCount:  number;
    unknownCount:  number;
  };
  csv: string;
  completedAt: string;
}

let cachedAuditQueue: Queue<AuditCompleteJob> | null = null;
let warned = false;

function connection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export function getAuditCompleteQueue(): Queue<AuditCompleteJob> | null {
  if (process.env.WORKER_DISABLED === '1') {
    if (!warned) { logger.info('WORKER_DISABLED=1 — skipping queue setup'); warned = true; }
    return null;
  }
  if (!cachedAuditQueue) {
    cachedAuditQueue = new Queue<AuditCompleteJob>(QUEUE_NAMES.auditComplete, { connection: connection() });
  }
  return cachedAuditQueue;
}

export async function enqueueAuditComplete(payload: AuditCompleteJob): Promise<void> {
  const q = getAuditCompleteQueue();
  if (!q) return;
  try {
    await q.add('send', payload, { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  } catch (e) {
    logger.error(`Failed to enqueue audit-complete: ${(e as Error).message}`);
  }
}
