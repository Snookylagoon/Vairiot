import { createApp } from './app';
import { assertEncryptionKey } from './lib/crypto';
import { logger } from './lib/logger';
import { assertScopedMinioCredentials, ensurePhotosBucket, ensureDocumentsBucket, ensureMobileReleasesBucket } from './lib/minio';
import { initMonitoring } from './lib/monitoring';
import { prisma } from './lib/prisma';
import { getRedis } from './lib/redis';
import { assertRlsRole } from './lib/rls-check';
import { applyServerTimeouts } from './lib/server-timeouts';

const PORT = Number(process.env.API_PORT) || 3001;

async function main() {
  initMonitoring();
  if (process.env.NODE_ENV === 'production') assertEncryptionKey();
  assertScopedMinioCredentials();
  await prisma.$connect();
  logger.info('Database connected');
  await assertRlsRole();
  try { await getRedis().connect(); logger.info('Redis connected'); } catch (e) {
    logger.warn(`Redis connection skipped: ${(e as Error).message}`);
  }
  // Production must connect as the bucket-limited app user created by
  // minio-init (SEC-M3, KFR-042); the root user is refused unless allowed.
  if (process.env.MINIO_ALLOW_ROOT === 'true' && process.env.MINIO_CREDENTIALS !== 'scoped') {
    logger.warn('MinIO: running with the ROOT credentials because MINIO_ALLOW_ROOT=true.');
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
