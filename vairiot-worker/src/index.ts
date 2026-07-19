import { writeFileSync } from 'node:fs';

import { Worker, Queue, ConnectionOptions, Job } from 'bullmq';

import { logger } from './logger';
import { verifyMailer } from './mailer';
import { initMonitoring, captureException } from './monitoring';
import { handleAlertDigest } from './processors/alert-digest';
import { handleAuditComplete } from './processors/audit-complete';
import { handleSchedulerTick, setDigestQueue } from './processors/notification-scheduler';
import { handleUserInvite } from './processors/user-invite';
import { QUEUE_NAMES, AuditCompleteJob, AlertDigestJob, UserInviteJob, SchedulerTickJob } from './queues';

initMonitoring();

// Report a job to Sentry only once it has exhausted its retries (dead-letter),
// so transient failures that later succeed don't page anyone.
function reportIfExhausted(queue: string, job: Job | undefined, err: Error): void {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 1;
  if (attemptsMade >= maxAttempts) {
    captureException(err, { queue, jobId: job?.id, attemptsMade, maxAttempts, data: job?.data });
  }
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const u = new URL(redisUrl);
const connection: ConnectionOptions = {
  host: u.hostname,
  port: Number(u.port || 6379),
  password: u.password || undefined,
  maxRetriesPerRequest: null,
};

const auditCompleteWorker = new Worker<AuditCompleteJob>(
  QUEUE_NAMES.auditComplete,
  handleAuditComplete,
  { connection, concurrency: 4 },
);

auditCompleteWorker.on('failed', (job, err) => {
  logger.error(`audit-complete job ${job?.id ?? '?'} failed: ${err.message}`);
  reportIfExhausted(QUEUE_NAMES.auditComplete, job, err);
});
auditCompleteWorker.on('completed', (job) => {
  logger.info(`audit-complete job ${job.id} completed`);
});

const alertDigestWorker = new Worker<AlertDigestJob>(
  QUEUE_NAMES.alertDigest,
  handleAlertDigest,
  { connection, concurrency: 4 },
);

alertDigestWorker.on('failed', (job, err) => {
  logger.error(`alert-digest job ${job?.id ?? '?'} failed: ${err.message}`);
  reportIfExhausted(QUEUE_NAMES.alertDigest, job, err);
});
alertDigestWorker.on('completed', (job) => {
  logger.info(`alert-digest job ${job.id} completed`);
});

const userInviteWorker = new Worker<UserInviteJob>(
  QUEUE_NAMES.userInvite,
  handleUserInvite,
  { connection, concurrency: 4 },
);

userInviteWorker.on('failed', (job, err) => {
  logger.error(`user-invite job ${job?.id ?? '?'} failed: ${err.message}`);
  reportIfExhausted(QUEUE_NAMES.userInvite, job, err);
});
userInviteWorker.on('completed', (job) => {
  logger.info(`user-invite job ${job.id} completed`);
});

// ── Notification scheduler ───────────────────────────────────────────────────
// Repeatable ticks that fan out alert digests (with maintenance-due items).
// Cron patterns are configurable; defaults: daily 07:00, weekly Monday 07:00.

const DAILY_CRON  = process.env.ALERT_DIGEST_DAILY_CRON  || '0 7 * * *';
const WEEKLY_CRON = process.env.ALERT_DIGEST_WEEKLY_CRON || '0 7 * * 1';

const schedulerQueue = new Queue<SchedulerTickJob>(QUEUE_NAMES.notificationScheduler, { connection });
const digestQueue    = new Queue<AlertDigestJob>(QUEUE_NAMES.alertDigest, { connection });
setDigestQueue(digestQueue);

const schedulerWorker = new Worker<SchedulerTickJob>(
  QUEUE_NAMES.notificationScheduler,
  handleSchedulerTick,
  { connection, concurrency: 1 },
);

schedulerWorker.on('failed', (job, err) => {
  logger.error(`notification-scheduler job ${job?.id ?? '?'} failed: ${err.message}`);
  reportIfExhausted(QUEUE_NAMES.notificationScheduler, job, err);
});

async function registerSchedules(): Promise<void> {
  // Drop stale repeatable entries (e.g. a changed cron pattern) before re-adding
  // so exactly one daily and one weekly schedule exist.
  const existing = await schedulerQueue.getRepeatableJobs();
  for (const r of existing) {
    await schedulerQueue.removeRepeatableByKey(r.key);
  }
  await schedulerQueue.add('tick', { frequency: 'daily' },
    { repeat: { pattern: DAILY_CRON },  removeOnComplete: 20, removeOnFail: 50, attempts: 2 });
  await schedulerQueue.add('tick', { frequency: 'weekly' },
    { repeat: { pattern: WEEKLY_CRON }, removeOnComplete: 20, removeOnFail: 50, attempts: 2 });
  logger.info(`notification-scheduler registered: daily "${DAILY_CRON}", weekly "${WEEKLY_CRON}"`);
}
registerSchedules().catch((err) => {
  logger.error(`Failed to register notification schedules: ${(err as Error).message}`);
  captureException(err as Error, { queue: QUEUE_NAMES.notificationScheduler });
});

// Liveness heartbeat — the container HEALTHCHECK checks the freshness of this
// file, so a wedged event loop is detected even when the process is still up.
const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/worker-heartbeat';
function touchHeartbeat(): void {
  try {
    writeFileSync(HEARTBEAT_PATH, String(Date.now()));
  } catch (err) {
    logger.warn(`heartbeat write failed: ${(err as Error).message}`);
  }
}
touchHeartbeat();
const heartbeatTimer = setInterval(touchHeartbeat, 30_000);
heartbeatTimer.unref();

logger.info('Vairiot worker started. Queues: ' + Object.values(QUEUE_NAMES).join(', '));
void verifyMailer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down…`);
  clearInterval(heartbeatTimer);
  await auditCompleteWorker.close();
  await alertDigestWorker.close();
  await userInviteWorker.close();
  await schedulerWorker.close();
  await schedulerQueue.close();
  await digestQueue.close();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
