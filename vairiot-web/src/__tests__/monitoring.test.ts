import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
vi.mock('@sentry/react', () => ({ init }));

import { initMonitoring } from '../lib/monitoring';

describe('initMonitoring', () => {
  beforeEach(() => init.mockClear());

  it('stays off without a DSN and never loads the SDK', async () => {
    expect(initMonitoring('')).toBe(false);
    expect(initMonitoring(undefined)).toBe(false);
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
  });

  it('initialises with errors only (no tracing) when a DSN is set', async () => {
    expect(initMonitoring('https://key@glitchtip.example/1')).toBe(true);
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(init.mock.calls[0][0]).toMatchObject({
      dsn: 'https://key@glitchtip.example/1',
      tracesSampleRate: 0,
    });
  });
});
