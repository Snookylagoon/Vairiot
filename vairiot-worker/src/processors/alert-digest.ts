import { Job } from 'bullmq';
import { logger } from '../logger';
import { getMailer, FROM_ADDRESS } from '../mailer';
import { AlertDigestJob } from '../queues';

export async function handleAlertDigest(job: Job<AlertDigestJob>): Promise<void> {
  const { recipientEmail, recipientName, frequency, exceptionTypes, tenantId } = job.data;

  const subject = `Vairiot ${frequency} exceptions digest`;
  const lines = [
    `Hello ${recipientName ?? ''}`.trim() + ',',
    '',
    `Here is your ${frequency} exceptions digest for the alert types you subscribed to:`,
    '',
    ...exceptionTypes.map(t => `  • ${t.replace(/_/g, ' ')}`),
    '',
    'Log in to Vairiot to review these items and take action.',
    '',
    '— Vairiot',
  ];

  const info = await getMailer().sendMail({
    from: FROM_ADDRESS,
    to: recipientEmail,
    subject,
    text: lines.join('\n'),
  });

  logger.info(`alert-digest job ${job.id} sent: ${info.messageId ?? '(no id)'} for tenant ${tenantId}`);
}
