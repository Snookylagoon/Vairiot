import { Queue, ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, type ApprovalNotifyJob, type AuditCompleteJob, type DepreciationRunJob, type RegisterImportJob, type UserInviteJob, type WebhookDeliverJob } from 'vairiot-shared';

import { logger } from './logger';

export { QUEUE_NAMES };
export type { AuditCompleteJob, DepreciationRunJob, UserInviteJob, WebhookDeliverJob };

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

let cachedWebhookQueue: Queue<WebhookDeliverJob> | null = null;

export function getWebhookDeliverQueue(): Queue<WebhookDeliverJob> | null {
  if (isWorkerDisabled()) return null;
  if (!cachedWebhookQueue) {
    cachedWebhookQueue = new Queue<WebhookDeliverJob>(QUEUE_NAMES.webhookDeliver, { connection: connection() });
  }
  return cachedWebhookQueue;
}

/** Returns false when the job could not be enqueued (caller may fall back to direct dispatch). */
export async function enqueueWebhookDeliver(payload: WebhookDeliverJob): Promise<boolean> {
  const q = getWebhookDeliverQueue();
  if (!q) return false;
  try {
    await q.add('deliver', payload, JOB_OPTS);
    return true;
  } catch (e) {
    logger.error(`Failed to enqueue webhook-deliver: ${(e as Error).message}`);
    return false;
  }
}

let cachedDepreciationQueue: Queue<DepreciationRunJob> | null = null;

/**
 * Hands a depreciation run to the worker (stage 2.10). One job per run at a
 * time (the job id is the run's): the run row records what was asked.
 * False when no queue is available (WORKER_DISABLED=1, or Redis down).
 */
export async function enqueueDepreciationRun(payload: DepreciationRunJob): Promise<boolean> {
  if (isWorkerDisabled()) return false;
  cachedDepreciationQueue ??= new Queue<DepreciationRunJob>(QUEUE_NAMES.depreciationRun, { connection: connection() });
  try {
    await cachedDepreciationQueue.add('run', payload, { removeOnComplete: 100, removeOnFail: 200, attempts: 1 });
    return true;
  } catch (e) {
    logger.error(`Failed to enqueue depreciation-run: ${(e as Error).message}`);
    return false;
  }
}

let cachedImportQueue: Queue<RegisterImportJob> | null = null;

/** Queues a step of a staged import (stage 2.13); nothing when the worker is off. */
export async function enqueueRegisterImport(payload: RegisterImportJob): Promise<boolean> {
  if (isWorkerDisabled()) return false;
  cachedImportQueue ??= new Queue<RegisterImportJob>(QUEUE_NAMES.registerImport, { connection: connection() });
  try {
    await cachedImportQueue.add(payload.step, payload, { removeOnComplete: 100, removeOnFail: 200, attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
    return true;
  } catch (e) {
    logger.error(`Failed to enqueue register-import: ${(e as Error).message}`);
    return false;
  }
}

let cachedApprovalQueue: Queue<ApprovalNotifyJob> | null = null;

/** Tells approvers of a request, or its requester of the decision (stage 3.2); never fails the request. */
export async function enqueueApprovalNotify(payload: ApprovalNotifyJob): Promise<boolean> {
  if (isWorkerDisabled()) return false;
  cachedApprovalQueue ??= new Queue<ApprovalNotifyJob>(QUEUE_NAMES.approvalNotify, { connection: connection() });
  try {
    await cachedApprovalQueue.add(payload.event, payload, { removeOnComplete: 200, removeOnFail: 500, attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });
    return true;
  } catch (e) {
    logger.error(`Failed to enqueue approval-notify: ${(e as Error).message}`);
    return false;
  }
}
