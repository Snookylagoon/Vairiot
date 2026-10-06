import { createApp } from './app';
import { assertEncryptionKey } from './lib/crypto';
import { logger } from './lib/logger';
import { ensurePhotosBucket, ensureDocumentsBucket, ensureMobileReleasesBucket } from './lib/minio';
import { initMonitoring } from './lib/monitoring';
import { prisma } from './lib/prisma';
import { getRedis } from './lib/redis';
import { applyServerTimeouts } from './lib/server-timeouts';

const PORT = Number(process.env.API_PORT) || 3001;

async function main() {
  initMonitoring();
  if (process.env.NODE_ENV === 'production') assertEncryptionKey();
  await prisma.$connect();
  logger.info('Database connected');
  try { await getRedis().connect(); logger.info('Redis connected'); } catch (e) {
    logger.warn(`Redis connection skipped: ${(e as Error).message}`);
  }
  // MINIO_CREDENTIALS=scoped is set by docker-compose.prod.yml when the API
  // connects as the bucket-limited app user created by minio-init (SEC-M3).
  if (process.env.NODE_ENV === 'production' && process.env.MINIO_CREDENTIALS !== 'scoped') {
    logger.warn('MinIO: connected with the ROOT credentials. Set MINIO_ACCESS_KEY / MINIO_SECRET_KEY in .env and redeploy.');
  }
  try { await ensurePhotosBucket(); await ensureDocumentsBucket(); await ensureMobileReleasesBucket(); } catch (e) {
    logger.warn(`MinIO bucket bootstrap skipped: ${(e as Error).message}`);
  }
  const app = createApp();
  const server = app.listen(PORT, () => {
    logger.info(`Vairiot API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
  applyServerTimeouts(server);
}

main().catch((err) => { logger.error('Failed to start', { error: err }); process.exit(1); });
