import { Worker, ConnectionOptions } from 'bullmq';
import { logger } from './logger';
import { QUEUE_NAMES, AuditCompleteJob } from './queues';
import { handleAuditComplete } from './processors/audit-complete';
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

logger.info('Vairiot worker started. Queues: ' + Object.values(QUEUE_NAMES).join(', '));
void verifyMailer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down…`);
  await auditCompleteWorker.close();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
