import { writeFileSync } from 'node:fs';
import { Worker, ConnectionOptions, Job } from 'bullmq';
import { logger } from './logger';
import { QUEUE_NAMES, AuditCompleteJob, AlertDigestJob, UserInviteJob } from './queues';
import { handleAuditComplete } from './processors/audit-complete';
import { handleAlertDigest } from './processors/alert-digest';
import { handleUserInvite } from './processors/user-invite';
import { verifyMailer } from './mailer';
import { initMonitoring, captureException } from './monitoring';

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
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
