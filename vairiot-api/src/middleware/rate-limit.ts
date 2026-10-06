import type { Request } from 'express';
import rateLimit, { Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { getRedis } from '../lib/redis';

const isTest = process.env.NODE_ENV === 'test';

// Redis-backed store so limits hold across API replicas and restarts.
// Tests fall back to the in-memory store (no Redis dependency).
function redisStore(prefix: string): Store | undefined {
  if (isTest) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis exposes arbitrary commands via call()
    sendCommand: (command: string, ...args: string[]) =>
      getRedis().call(command, ...args) as Promise<never>,
  });
}

/** Per-minute budget for the offline-sync routes, per signed-in user. */
export const SYNC_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_SYNC_PER_MIN) || 600;

// The routes scanners hit when they flush an offline queue. A depot of
// handhelds behind one NAT shares a single public IP, so these are exempt
// from the per-IP global limit and get a per-user limit instead (syncLimiter,
// mounted after authentication).
const SYNC_ROUTES: RegExp[] = [
  /^\/api\/v1\/assets\/?$/,                               // POST /assets
  /^\/api\/v1\/audits\/[^/]+\/scans\/?$/,                 // POST /audits/:id/scans
  /^\/api\/v1\/scan-sessions\/?$/,                        // POST /scan-sessions
  /^\/api\/v1\/(assets|maintenance)\/[^/]+\/photos\/?$/,  // POST photo uploads
];

export function isSyncRequest(req: Request): boolean {
  if (req.method !== 'POST') return false;
  const path = req.originalUrl.split('?')[0];
  return SYNC_ROUTES.some((re) => re.test(path));
}

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  skipSuccessfulRequests: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  store: redisStore('login'),
});

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10000 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
  // Sync routes are limited per user by syncLimiter instead.
  skip: isSyncRequest,
  store: redisStore('global'),
});

/**
 * Per-user limit for the sync routes. Mount after `authenticate`: the key is
 * the token subject (user id, or `apikey:<id>`), so every device a user signs
 * in on shares one budget no matter which IP it comes from. Requests that are
 * not sync routes pass straight through.
 */
export function createSyncLimiter(limit = SYNC_LIMIT_PER_MINUTE, store?: Store) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sync requests. Please slow down.', code: 'RATE_LIMITED' },
    validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
    skip: (req) => !isSyncRequest(req),
    keyGenerator: (req) => `${req.user?.tenantId ?? '-'}:${req.user?.sub ?? req.ip}`,
    store,
  });
}

export const syncLimiter = createSyncLimiter(SYNC_LIMIT_PER_MINUTE, redisStore('sync'));

/**
 * Public, unauthenticated iOS enrolment callback (writes to the device queue).
 * Real enrolments happen a handful of times per device, ever.
 */
export function createEnrolmentLimiter(limit = 10, store?: Store) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many enrolment attempts. Please try again later.' },
    validate: { trustProxy: false, xForwardedForHeader: false },
    store,
  });
}

export const enrolmentLimiter = createEnrolmentLimiter(isTest ? 1000 : 10, redisStore('ios-enrol'));

/**
 * Public APK/IPA downloads: large responses, no auth. Generous enough for a
 * depot of devices behind one NAT updating together after a release.
 */
export const appDownloadLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: isTest ? 1000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many download attempts. Please try again later.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
  store: redisStore('app-download'),
});
