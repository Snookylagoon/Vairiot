// Optional Sentry error tracking for the worker. No-op unless SENTRY_DSN is set.
import * as Sentry from '@sentry/node';
import { logger } from './logger';

let enabled = false;

export function initMonitoring(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    release: process.env.SENTRY_RELEASE,
  });
  enabled = true;
  logger.info('Sentry monitoring enabled (worker)');
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
