import { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { minioClient, DOCUMENT_BUCKET } from '../lib/minio';

export async function listDocuments(tenantId: string, assetId: string) {
  return prisma.document.findMany({
    where: { tenantId, assetId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, documentType: true, fileName: true, mimeType: true, sizeBytes: true, notes: true, createdBy: true, createdAt: true },
  });
}

export async function uploadDocument(params: {
  tenantId: string;
  assetId: string;
  actorId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  documentType: string;
  notes?: string;
}) {
  const asset = await prisma.asset.findFirst({ where: { id: params.assetId, tenantId: params.tenantId } });
  if (!asset) throw new Error('ASSET_NOT_FOUND');

  const storageKey = `${params.tenantId}/${params.assetId}/${Date.now()}-${randomHex(8)}-${params.fileName}`;

  await minioClient.putObject(
    DOCUMENT_BUCKET,
    storageKey,
    params.buffer,
    params.buffer.length,
    { 'Content-Type': params.mimeType },
  );

  return prisma.document.create({
    data: {
      tenantId: params.tenantId,
      assetId: params.assetId,
      documentType: params.documentType,
      fileName: params.fileName,
      storageKey,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
      notes: params.notes,
      createdBy: params.actorId,
    },
    select: { id: true, documentType: true, fileName: true, mimeType: true, sizeBytes: true, notes: true, createdBy: true, createdAt: true },
  });
}

export async function getDocumentStream(tenantId: string, docId: string): Promise<{ stream: Readable; mimeType: string; fileName: string }> {
  const doc = await prisma.document.findFirst({ where: { id: docId, tenantId } });
  if (!doc) throw new Error('NOT_FOUND');
  const stream = await minioClient.getObject(DOCUMENT_BUCKET, doc.storageKey);
  return { stream, mimeType: doc.mimeType, fileName: doc.fileName };
}

export async function deleteDocument(tenantId: string, docId: string) {
  const doc = await prisma.document.findFirst({ where: { id: docId, tenantId } });
  if (!doc) throw new Error('NOT_FOUND');
  await minioClient.removeObject(DOCUMENT_BUCKET, doc.storageKey).catch(() => {});
  await prisma.document.delete({ where: { id: docId } });
  return { id: docId };
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
