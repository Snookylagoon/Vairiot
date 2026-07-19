import { Job } from 'bullmq';
import { logger } from '../logger';
import { getMailer, getFromAddress } from '../mailer';
import { AlertDigestJob } from '../queues';

const TYPE_LABELS: Record<string, string> = {
  missing_documents:   'Assets missing documents',
  overdue_maintenance: 'Overdue maintenance',
  expired_warranty:    'Expired warranties',
  unlocated_assets:    'Assets without a site',
};

export async function handleAlertDigest(job: Job<AlertDigestJob>): Promise<void> {
  const { recipientEmail, recipientName, frequency, exceptionTypes, counts, upcomingMaintenance, tenantId } = job.data;

  const subject = `Vairiot ${frequency} exceptions digest`;
  const lines: string[] = [
    `Hello ${recipientName ?? ''}`.trim() + ',',
    '',
    `Here is your ${frequency} exceptions digest:`,
    '',
  ];

  for (const t of exceptionTypes) {
    const label = TYPE_LABELS[t] ?? t.replace(/_/g, ' ');
    const count = counts?.[t];
    lines.push(count !== undefined ? `  • ${label}: ${count}` : `  • ${label}`);
  }

  if (upcomingMaintenance && upcomingMaintenance.length > 0) {
    lines.push('', 'Maintenance due in the next 7 days:', '');
    for (const m of upcomingMaintenance) {
      const flag = m.overdue ? ' (OVERDUE)' : '';
      lines.push(`  • ${m.scheduledDate} — ${m.assetNumber} ${m.assetName}: ${m.maintenanceType}${flag}`);
    }
  }

  lines.push('', 'Log in to Vairiot to review these items and take action.', '', '— Vairiot');

  const mailer = await getMailer();
  const fromAddress = await getFromAddress();
  const info = await mailer.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject,
    text: lines.join('\n'),
  });

  logger.info(`alert-digest job ${job.id} sent: ${info.messageId ?? '(no id)'} for tenant ${tenantId}`);
}
