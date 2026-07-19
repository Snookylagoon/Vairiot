import { PrismaClient } from '@prisma/client';

import { logger } from './logger';

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = g.prisma ?? new PrismaClient({
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
