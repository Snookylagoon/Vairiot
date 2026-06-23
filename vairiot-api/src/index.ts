import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { ensurePhotosBucket, ensureDocumentsBucket, ensureMobileReleasesBucket } from './lib/minio';
import { getRedis } from './lib/redis';

const PORT = Number(process.env.API_PORT) || 3001;

async function main() {
  await prisma.$connect();
  logger.info('Database connected');
  try { await getRedis().connect(); logger.info('Redis connected'); } catch (e) {
    logger.warn(`Redis connection skipped: ${(e as Error).message}`);
  }
  try { await ensurePhotosBucket(); await ensureDocumentsBucket(); await ensureMobileReleasesBucket(); } catch (e) {
    logger.warn(`MinIO bucket bootstrap skipped: ${(e as Error).message}`);
  }
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`Vairiot API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
}

main().catch((err) => { logger.error('Failed to start', { error: err }); process.exit(1); });
