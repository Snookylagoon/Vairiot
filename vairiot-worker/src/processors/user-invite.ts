import { Job } from 'bullmq';

import { logger } from '../logger';
import { getMailer, getFromAddress } from '../mailer';
import { UserInviteJob } from '../queues';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export async function handleUserInvite(job: Job<UserInviteJob>): Promise<void> {
  const { recipientEmail, recipientName, inviteToken, inviterName } = job.data;
  const acceptUrl = `${APP_URL}/accept-invite?token=${inviteToken}`;

  const subject = 'You have been invited to Vairiot';
  const text = [
    `Hello ${recipientName},`,
    '',
    inviterName
      ? `${inviterName} has invited you to join their organisation on Vairiot.`
      : 'You have been invited to join an organisation on Vairiot.',
    '',
    'Click the link below to set your password and activate your account:',
    '',
    acceptUrl,
    '',
    'This link expires in 48 hours.',
    '',
    'If you did not expect this invitation, you can safely ignore this email.',
    '',
    '— Vairiot',
  ].join('\n');

  const mailer = await getMailer();
  const fromAddress = await getFromAddress();
  const info = await mailer.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject,
    text,
  });
  logger.info(`user-invite job ${job.id} sent: ${info.messageId ?? '(no id)'} to ${recipientEmail}`);
}
