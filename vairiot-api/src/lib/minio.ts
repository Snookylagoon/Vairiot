import { Client } from 'minio';
import { logger } from './logger';

const PHOTO_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'vairiot-photos';
const DOCUMENT_BUCKET = process.env.MINIO_DOCUMENTS_BUCKET ?? 'vairiot-documents';
const MOBILE_RELEASES_BUCKET = process.env.MINIO_MOBILE_RELEASES_BUCKET ?? 'vairiot-mobile-releases';

export const minioClient = new Client({
  endPoint:  process.env.MINIO_ENDPOINT  ?? 'localhost',
  port:      Number(process.env.MINIO_PORT ?? 9000),
  useSSL:    (process.env.MINIO_USE_SSL ?? 'false') === 'true',
  accessKey: process.env.MINIO_ROOT_USER     ?? process.env.MINIO_ACCESS_KEY ?? 'vairiot-minio',
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? process.env.MINIO_SECRET_KEY ?? 'changeme-minio',
});

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
