import type { Readable } from 'stream';

import { readStrippedImage } from './image-metadata';
import { minioClient, PHOTO_BUCKET } from './minio';

export function logoMimeType(storageKey: string): string {
  const ext = storageKey.split('.').pop();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

/** A company logo as served: metadata removed, one of them publicly (KFR-043). */
export async function readCompanyLogo(storageKey: string): Promise<{ body: Buffer; mimeType: string }> {
  const mimeType = logoMimeType(storageKey);
  const stream = await minioClient.getObject(PHOTO_BUCKET, storageKey);
  return { body: await readStrippedImage(stream as Readable, mimeType), mimeType };
}
