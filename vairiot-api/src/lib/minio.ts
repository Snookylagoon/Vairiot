import { Client } from 'minio';

import { logger } from './logger';

const PHOTO_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'vairiot-photos';
const DOCUMENT_BUCKET = process.env.MINIO_DOCUMENTS_BUCKET ?? 'vairiot-documents';
const MOBILE_RELEASES_BUCKET = process.env.MINIO_MOBILE_RELEASES_BUCKET ?? 'vairiot-mobile-releases';

export const minioClient = new Client({
  endPoint:  process.env.MINIO_ENDPOINT  ?? 'localhost',
  port:      Number(process.env.MINIO_PORT ?? 9000),
  useSSL:    (process.env.MINIO_USE_SSL ?? 'false') === 'true',
  // Prefer a scoped service account (MINIO_ACCESS_KEY/SECRET_KEY) when provided,
  // falling back to root only if it isn't. `||` so empty env strings fall through.
  accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER     || 'vairiot-minio',
  secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'changeme-minio',
});

/**
 * Refuses to run a production API on the MinIO root credentials (KFR-042).
 * docker-compose.prod.yml sets MINIO_CREDENTIALS=scoped when the API gets the
 * bucket-limited user that minio-init creates (KFR-033). That used to be only a
 * warning, so a server without MINIO_ACCESS_KEY kept running as root unnoticed.
 * MINIO_ALLOW_ROOT=true is the deliberate escape hatch for a one-box install.
 */
export function assertScopedMinioCredentials(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (env.MINIO_CREDENTIALS === 'scoped' || env.MINIO_ALLOW_ROOT === 'true') return;
  throw new Error(
    'MinIO: refusing to start with the ROOT credentials. Set MINIO_ACCESS_KEY / MINIO_SECRET_KEY ' +
    'in .env and redeploy (DEPLOY.md → Operational env vars), or set MINIO_ALLOW_ROOT=true to accept the risk.',
  );
}

export async function ensurePhotosBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(PHOTO_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(PHOTO_BUCKET);
    logger.info(`MinIO bucket created: ${PHOTO_BUCKET}`);
  }
}

export async function ensureDocumentsBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(DOCUMENT_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(DOCUMENT_BUCKET);
    logger.info(`MinIO bucket created: ${DOCUMENT_BUCKET}`);
  }
}

export async function ensureMobileReleasesBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(MOBILE_RELEASES_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(MOBILE_RELEASES_BUCKET);
    logger.info(`MinIO bucket created: ${MOBILE_RELEASES_BUCKET}`);
  }
}

export { PHOTO_BUCKET, DOCUMENT_BUCKET, MOBILE_RELEASES_BUCKET };
