import Redis from 'ioredis';

import { logger } from './logger';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  }
  return client;
}

const BLACKLIST_PREFIX = 'bl:';

export async function blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
  try {
    await getRedis().set(`${BLACKLIST_PREFIX}${jti}`, '1', 'EX', expiresInSeconds);
  } catch (e) {
    logger.error('Failed to blacklist token', { error: (e as Error).message });
  }
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    return (await getRedis().exists(`${BLACKLIST_PREFIX}${jti}`)) === 1;
  } catch {
    return false;
  }
}
