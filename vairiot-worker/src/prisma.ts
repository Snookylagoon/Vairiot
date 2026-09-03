import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// One client for the whole worker process.
//
// Until Prisma 7 there were four: mailer, webhook-deliver,
// notification-scheduler and storage-metering each did `new PrismaClient()`,
// so a single worker held four independent connection pools against the same
// database. That was already wasteful; Prisma 7 makes it explicit, because
// each client now needs its own driver adapter and therefore its own `pg`
// pool. Sharing one is both the smaller change and the right shape.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
