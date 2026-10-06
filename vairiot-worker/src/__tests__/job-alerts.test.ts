import { ALERT_WINDOW_MS, JobFailureAlerter } from '../job-alerts';

type Mail = { to: string; subject: string; text: string };

function setup(to = 'ops@example.com') {
  const sent: Mail[] = [];
  let now = Date.parse('2026-10-06T10:00:00Z');
  const alerter = new JobFailureAlerter(
    async (opts) => { sent.push(opts as Mail); },
    to,
    () => now,
    'production',
  );
  return { alerter, sent, advance: (ms: number) => { now += ms; } };
}

const job = (queue = 'user-invite', message = 'SMTP connection refused') =>
  ({ queue, jobId: 'job-42', attemptsMade: 3, error: new Error(message) });

describe('JobFailureAlerter', () => {
  it('does nothing when no alert address is configured', async () => {
    const { alerter, sent } = setup(''); // OPS_ALERT_EMAIL unset or empty
    expect(await alerter.notify(job())).toBe('disabled');
    expect(sent).toHaveLength(0);
  });

  it('emails the first failure straight away, without job data', async () => {
    const { alerter, sent } = setup();
    expect(await alerter.notify(job())).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ops@example.com');
    expect(sent[0].subject).toBe('[Vairiot production] Background job failed: user-invite');
    expect(sent[0].text).toContain('after 3 attempt(s)');
    expect(sent[0].text).toContain('job-42');
    expect(sent[0].text).toContain('SMTP connection refused');
  });

  it('throttles repeats per queue and reports how many were held back', async () => {
    const { alerter, sent, advance } = setup();
    await alerter.notify(job());
    for (let i = 0; i < 50; i++) {
      advance(1000);
      expect(await alerter.notify(job())).toBe('throttled');
    }
    expect(sent).toHaveLength(1);

    advance(ALERT_WINDOW_MS);
    expect(await alerter.notify(job())).toBe('sent');
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain('50 more "user-invite" failure(s)');
  });

  it('throttles each queue separately', async () => {
    const { alerter, sent } = setup();
    await alerter.notify(job('user-invite'));
    expect(await alerter.notify(job('webhook-deliver'))).toBe('sent');
    expect(sent.map((m) => m.subject)).toEqual([
      '[Vairiot production] Background job failed: user-invite',
      '[Vairiot production] Background job failed: webhook-deliver',
    ]);
  });

  it('survives the mail server being down', async () => {
    const alerter = new JobFailureAlerter(async () => { throw new Error('ECONNREFUSED'); }, 'ops@example.com');
    await expect(alerter.notify(job())).resolves.toBe('failed');
  });
});
