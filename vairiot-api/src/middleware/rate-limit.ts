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
  store: redisStore('global'),
});
