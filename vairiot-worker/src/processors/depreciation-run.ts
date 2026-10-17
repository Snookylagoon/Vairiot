import type { Job } from 'bullmq';

import { processDepreciationRun } from '../depreciation/run-job';
import { logger } from '../logger';
import { prisma } from '../prisma';
import type { DepreciationRunJob } from '../queues';

/** BullMQ handler for `depreciation-run` (stage 2.10). */
export async function handleDepreciationRun(job: Job<DepreciationRunJob>): Promise<void> {
  logger.info(`depreciation-run ${job.data.runId} for ${job.data.tenantId}`);
  await processDepreciationRun(prisma, job.data);
}
