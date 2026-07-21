import { Job } from 'bullmq';

import { logger } from '../logger';
import { sendMail, getFromAddress } from '../mailer';
import { AuditCompleteJob } from '../queues';

export async function handleAuditComplete(job: Job<AuditCompleteJob>): Promise<void> {
  const { campaignName, recipientEmail, recipientName, summary, csv, campaignId } = job.data;
  const subject = `Audit complete — ${campaignName}`;
  const text = [
    `Hello ${recipientName ?? ''}`.trim() + ',',
    ``,
    `The audit "${campaignName}" has been completed.`,
    ``,
    `Expected: ${summary.totalExpected}`,
    `Scanned:  ${summary.totalScanned}`,
    `Found:    ${summary.found}`,
    `Missing:  ${summary.missingCount}`,
    `Unknown:  ${summary.unknownCount}`,
    ``,
    `The full report is attached as a CSV file.`,
    ``,
    `— Vairiot`,
  ].join('\n');

  const fromAddress = await getFromAddress();
  const info = await sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject,
    text,
    attachments: [{ filename: `audit-${campaignId.slice(0, 8)}.csv`, content: csv, contentType: 'text/csv' }],
  });
  logger.info(`audit-complete job ${job.id} sent: ${(info.messageId ?? '(no id)')} for campaign ${campaignId}`);
}
