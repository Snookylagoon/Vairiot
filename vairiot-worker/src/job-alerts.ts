// Email alerts for background jobs that have failed for good (every retry
// used). Before this, such jobs were only visible in Sentry when a DSN was
// set, and otherwise vanished from the queue unnoticed (BullMQ keeps a capped
// list of failed jobs).
//
// Throttled per queue: the first failure in a window sends an email at once;
// further failures in the next ALERT_WINDOW_MS are counted and reported in the
// next email, so an outage produces a handful of emails, not thousands.
// No job data goes into the email: it can hold personal details (invite
// recipients, report contents). The job id is enough to find it in the logs.
import type { SendMailOptions } from 'nodemailer';

import { logger } from './logger';

export const ALERT_WINDOW_MS = 15 * 60 * 1000;

export interface ExhaustedJob {
  queue: string;
  jobId?: string;
  attemptsMade: number;
  error: Error;
}

export type AlertOutcome = 'sent' | 'throttled' | 'disabled' | 'failed';

export class JobFailureAlerter {
  private readonly lastSent = new Map<string, number>();
  private readonly suppressed = new Map<string, number>();

  constructor(
    private readonly send: (opts: SendMailOptions) => Promise<unknown>,
    private readonly to: string | undefined = process.env.OPS_ALERT_EMAIL,
    private readonly now: () => number = Date.now,
    private readonly environment: string = process.env.NODE_ENV ?? 'development',
  ) {}

  async notify(job: ExhaustedJob): Promise<AlertOutcome> {
    if (!this.to) return 'disabled';

    const now = this.now();
    const last = this.lastSent.get(job.queue);
    if (last !== undefined && now - last < ALERT_WINDOW_MS) {
      this.suppressed.set(job.queue, (this.suppressed.get(job.queue) ?? 0) + 1);
      return 'throttled';
    }

    const earlier = this.suppressed.get(job.queue) ?? 0;
    this.lastSent.set(job.queue, now);
    this.suppressed.set(job.queue, 0);

    const lines = [
      `A "${job.queue}" job failed after ${job.attemptsMade} attempt(s) and will not be retried.`,
      '',
      `Job id:  ${job.jobId ?? 'unknown'}`,
      `Error:   ${job.error.message}`,
      `Time:    ${new Date(now).toISOString()}`,
      `Server:  ${this.environment}`,
    ];
    if (earlier > 0) {
      lines.push('', `${earlier} more "${job.queue}" failure(s) since the previous alert were not emailed separately.`);
    }
    lines.push('', 'Details are in the worker logs (docker logs vairiot_worker) and in Sentry if it is enabled.');

    try {
      await this.send({
        to: this.to,
        subject: `[Vairiot ${this.environment}] Background job failed: ${job.queue}`,
        text: lines.join('\n'),
      });
      return 'sent';
    } catch (e) {
      // If mail itself is broken (often the very thing failing), don't loop:
      // log it and carry on. Sentry, if enabled, still has the job error.
      logger.error(`could not send job-failure alert for ${job.queue}: ${(e as Error).message}`);
      return 'failed';
    }
  }
}
