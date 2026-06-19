import { Worker, ConnectionOptions } from 'bullmq';
import { logger } from './logger';
import { QUEUE_NAMES, AuditCompleteJob, AlertDigestJob, UserInviteJob } from './queues';
import { handleAuditComplete } from './processors/audit-complete';
import { handleAlertDigest } from './processors/alert-digest';
import { handleUserInvite } from './processors/user-invite';
import { verifyMailer } from './mailer';

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
});
userInviteWorker.on('completed', (job) => {
  logger.info(`user-invite job ${job.id} completed`);
});

logger.info('Vairiot worker started. Queues: ' + Object.values(QUEUE_NAMES).join(', '));
void verifyMailer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down…`);
  await auditCompleteWorker.close();
  await alertDigestWorker.close();
  await userInviteWorker.close();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
