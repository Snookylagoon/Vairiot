import { Client } from 'minio';
import { logger } from './logger';

const PHOTO_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'vairiot-photos';

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

export { PHOTO_BUCKET };
