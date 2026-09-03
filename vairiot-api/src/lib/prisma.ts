import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { logger } from './logger';

// Prisma 7 no longer takes a connection string of its own: the client is handed
// a driver adapter, and the Postgres connection is a `pg` pool we own. Same
// DATABASE_URL as before — it just arrives by a different route (see
// prisma.config.ts for the CLI half).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const g = globalThis as unknown as { prisma?: PrismaClient };

// The adapter holds the pool, so it is built alongside the client and cached
// with it — a fresh adapter per hot reload would leak connections.
export const prisma: PrismaClient = g.prisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn',  emit: 'event' },
  ],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('error', (e: { message: string }) => logger.error('Prisma error',   { message: e.message }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('warn',  (e: { message: string }) => logger.warn('Prisma warning',  { message: e.message }));

if (process.env.NODE_ENV !== 'production') { g.prisma = prisma; }
