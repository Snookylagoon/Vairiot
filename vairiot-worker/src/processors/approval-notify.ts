import type { Job } from 'bullmq';

import { buildApprovalMail } from '../approvals/approval-mail';
import { logger } from '../logger';
import { getFromAddress, sendMail } from '../mailer';
import { prisma } from '../prisma';
import type { ApprovalNotifyJob } from '../queues';

// `||` not `??`: compose passes an unset APP_URL as "" rather than undefined.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export async function handleApprovalNotify(job: Job<ApprovalNotifyJob>): Promise<void> {
  const mail = await buildApprovalMail(prisma, job.data, APP_URL);
  if (!mail) { logger.info(`approval-notify job ${job.id}: nobody to tell`); return; }
  const from = await getFromAddress();
  // One message each, so approvers do not see one another's addresses.
  for (const to of mail.to) await sendMail({ from, to, subject: mail.subject, text: mail.text });
  logger.info(`approval-notify job ${job.id} sent to ${mail.to.length} recipient(s)`);
}
