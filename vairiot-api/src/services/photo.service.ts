import { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { minioClient, PHOTO_BUCKET } from '../lib/minio';

export async function listPhotos(tenantId: string, assetId: string) {
  return prisma.photo.findMany({
    where: { tenantId, assetId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mimeType: true, sizeBytes: true, width: true, height: true, createdAt: true, createdBy: true },
  });
}

export async function uploadPhoto(params: {
  tenantId: string;
  assetId:  string;
  actorId:  string;
  buffer:   Buffer;
  mimeType: string;
}) {
  const asset = await prisma.asset.findFirst({ where: { id: params.assetId, tenantId: params.tenantId } });
  if (!asset) throw new Error('ASSET_NOT_FOUND');

  const ext       = mimeToExt(params.mimeType);
  const storageKey = `${params.tenantId}/${params.assetId}/${Date.now()}-${randomHex(8)}${ext}`;

  await minioClient.putObject(
    PHOTO_BUCKET,
    storageKey,
    params.buffer,
    params.buffer.length,
    { 'Content-Type': params.mimeType },
  );

  return prisma.photo.create({
    data: {
      tenantId:   params.tenantId,
      assetId:    params.assetId,
      storageKey,
      mimeType:   params.mimeType,
      sizeBytes:  params.buffer.length,
      createdBy:  params.actorId,
    },
    select: { id: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
}

export async function getPhotoStream(tenantId: string, photoId: string): Promise<{ stream: Readable; mimeType: string }> {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new Error('NOT_FOUND');
  const stream = await minioClient.getObject(PHOTO_BUCKET, photo.storageKey);
  return { stream, mimeType: photo.mimeType };
}

export async function deletePhoto(tenantId: string, photoId: string) {
  const photo = await prisma.photo.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new Error('NOT_FOUND');
  await minioClient.removeObject(PHOTO_BUCKET, photo.storageKey).catch(() => {});
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
