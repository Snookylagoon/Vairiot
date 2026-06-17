import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma: PrismaClient = g.prisma ?? new PrismaClient({
  log: [{ level: 'error', emit: 'event' }, { level: 'warn', emit: 'event' }],
});
prisma.$on('error', (e) => logger.error('Prisma error', { message: e.message }));
prisma.$on('warn',  (e) => logger.warn('Prisma warning', { message: e.message }));
if (process.env.NODE_ENV !== 'production') { g.prisma = prisma; }
