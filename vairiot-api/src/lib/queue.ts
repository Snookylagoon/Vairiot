import { Queue, ConnectionOptions } from 'bullmq';
import { logger } from './logger';

export const QUEUE_NAMES = {
  auditComplete: 'audit-complete',
  userInvite: 'user-invite',
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

export interface UserInviteJob {
  tenantId:       string;
  recipientEmail: string;
  recipientName:  string;
  inviteToken:    string;
  inviterName?:   string;
}

let cachedAuditQueue: Queue<AuditCompleteJob> | null = null;
let cachedInviteQueue: Queue<UserInviteJob> | null = null;
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

function isWorkerDisabled(): boolean {
  if (process.env.WORKER_DISABLED === '1') {
    if (!warned) { logger.info('WORKER_DISABLED=1 — skipping queue setup'); warned = true; }
    return true;
  }
  return false;
}

export function getAuditCompleteQueue(): Queue<AuditCompleteJob> | null {
  if (isWorkerDisabled()) return null;
  if (!cachedAuditQueue) {
    cachedAuditQueue = new Queue<AuditCompleteJob>(QUEUE_NAMES.auditComplete, { connection: connection() });
  }
  return cachedAuditQueue;
}

export function getUserInviteQueue(): Queue<UserInviteJob> | null {
  if (isWorkerDisabled()) return null;
  if (!cachedInviteQueue) {
    cachedInviteQueue = new Queue<UserInviteJob>(QUEUE_NAMES.userInvite, { connection: connection() });
  }
  return cachedInviteQueue;
}

const JOB_OPTS = { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } };

export async function enqueueAuditComplete(payload: AuditCompleteJob): Promise<void> {
  const q = getAuditCompleteQueue();
  if (!q) return;
  try {
    await q.add('send', payload, JOB_OPTS);
  } catch (e) {
    logger.error(`Failed to enqueue audit-complete: ${(e as Error).message}`);
  }
}

export async function enqueueUserInvite(payload: UserInviteJob): Promise<void> {
  const q = getUserInviteQueue();
  if (!q) return;
  try {
    await q.add('send', payload, JOB_OPTS);
  } catch (e) {
    logger.error(`Failed to enqueue user-invite: ${(e as Error).message}`);
  }
}
