import { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { minioClient, PHOTO_BUCKET } from '../lib/minio';
import { NotFoundError } from '../lib/errors';

const photoSelect = {
  id: true, mimeType: true, sizeBytes: true, width: true, height: true,
  caption: true, createdAt: true, createdBy: true,
  thumbStorageKey: true,
} as const;

function addHasThumb(row: { thumbStorageKey: string | null; [k: string]: unknown }) {
  const { thumbStorageKey, ...rest } = row;
  return { ...rest, hasThumb: thumbStorageKey != null };
}

export async function listPhotos(tenantId: string, assetId: string) {
  const rows = await prisma.photo.findMany({
    where: { tenantId, assetId, maintenanceEventId: null },
    orderBy: { createdAt: 'desc' },
    select: photoSelect,
  });
  return rows.map(addHasThumb);
}

export async function listMaintenancePhotos(tenantId: string, maintenanceEventId: string) {
  const rows = await prisma.photo.findMany({
    where: { tenantId, maintenanceEventId },
    orderBy: { createdAt: 'desc' },
    select: photoSelect,
  });
  return rows.map(addHasThumb);
}

export async function updatePhoto(tenantId: string, photoId: string, patch: { caption?: string | null }) {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new NotFoundError('Photo not found');
  const row = await prisma.photo.update({
    where: { id: photoId },
    data:  { caption: patch.caption ?? null },
    select: photoSelect,
  });
  return addHasThumb(row);
}

export async function uploadPhoto(params: {
  tenantId:      string;
  assetId:       string;
  actorId:       string;
  buffer:        Buffer;
  mimeType:      string;
  thumbBuffer?:  Buffer;
  thumbMimeType?: string;
}) {
  const asset = await prisma.asset.findFirst({ where: { id: params.assetId, tenantId: params.tenantId } });
  if (!asset) throw new NotFoundError('Asset not found');

  const ts         = Date.now();
  const hex        = randomHex(8);
  const ext        = mimeToExt(params.mimeType);
  const storageKey = `${params.tenantId}/${params.assetId}/${ts}-${hex}${ext}`;

  await minioClient.putObject(
    PHOTO_BUCKET, storageKey, params.buffer, params.buffer.length,
    { 'Content-Type': params.mimeType },
  );

  let thumbStorageKey: string | undefined;
  if (params.thumbBuffer) {
    const thumbExt = mimeToExt(params.thumbMimeType ?? params.mimeType);
    thumbStorageKey = `${params.tenantId}/${params.assetId}/${ts}-${hex}_thumb${thumbExt}`;
    await minioClient.putObject(
      PHOTO_BUCKET, thumbStorageKey, params.thumbBuffer, params.thumbBuffer.length,
      { 'Content-Type': params.thumbMimeType ?? params.mimeType },
    );
  }

  const row = await prisma.photo.create({
    data: {
      tenantId:   params.tenantId,
      assetId:    params.assetId,
      storageKey,
      thumbStorageKey,
      mimeType:   params.mimeType,
      sizeBytes:  params.buffer.length,
      createdBy:  params.actorId,
    },
    select: photoSelect,
  });
  return addHasThumb(row);
}

export async function uploadMaintenancePhoto(params: {
  tenantId:           string;
  maintenanceEventId: string;
  actorId:            string;
  buffer:             Buffer;
  mimeType:           string;
  caption?:           string;
  thumbBuffer?:       Buffer;
  thumbMimeType?:     string;
}) {
  const evt = await prisma.maintenanceEvent.findFirst({
    where: { id: params.maintenanceEventId, tenantId: params.tenantId },
    select: { id: true, assetId: true },
  });
  if (!evt) throw new NotFoundError('Maintenance event not found');

  const ts         = Date.now();
  const hex        = randomHex(8);
  const ext        = mimeToExt(params.mimeType);
  const storageKey = `${params.tenantId}/maintenance/${evt.id}/${ts}-${hex}${ext}`;

  await minioClient.putObject(
    PHOTO_BUCKET, storageKey, params.buffer, params.buffer.length,
    { 'Content-Type': params.mimeType },
  );

  let thumbStorageKey: string | undefined;
  if (params.thumbBuffer) {
    const thumbExt = mimeToExt(params.thumbMimeType ?? params.mimeType);
    thumbStorageKey = `${params.tenantId}/maintenance/${evt.id}/${ts}-${hex}_thumb${thumbExt}`;
    await minioClient.putObject(
      PHOTO_BUCKET, thumbStorageKey, params.thumbBuffer, params.thumbBuffer.length,
      { 'Content-Type': params.thumbMimeType ?? params.mimeType },
    );
  }

  const row = await prisma.photo.create({
    data: {
      tenantId:           params.tenantId,
      assetId:            evt.assetId,
      maintenanceEventId: evt.id,
      storageKey,
      thumbStorageKey,
      mimeType:           params.mimeType,
      sizeBytes:          params.buffer.length,
      caption:            params.caption,
      createdBy:          params.actorId,
    },
    select: photoSelect,
  });
  return addHasThumb(row);
}

export async function getPhotoStream(tenantId: string, photoId: string, thumb = false): Promise<{ stream: Readable; mimeType: string }> {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new NotFoundError('Photo not found');
  const key = (thumb && photo.thumbStorageKey) ? photo.thumbStorageKey : photo.storageKey;
  const stream = await minioClient.getObject(PHOTO_BUCKET, key);
  return { stream, mimeType: photo.mimeType };
}

export async function deletePhoto(tenantId: string, photoId: string) {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new NotFoundError('Photo not found');
  await minioClient.removeObject(PHOTO_BUCKET, photo.storageKey).catch(() => {});
  if (photo.thumbStorageKey) {
    await minioClient.removeObject(PHOTO_BUCKET, photo.thumbStorageKey).catch(() => {});
  }
  await prisma.photo.delete({ where: { id: photoId } });
  return { id: photoId };
}

function mimeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg': return '.jpg';
    case 'image/jpg':  return '.jpg';
    case 'image/png':  return '.png';
    case 'image/webp': return '.webp';
    case 'image/heic': return '.heic';
    default:           return '';
  }
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
