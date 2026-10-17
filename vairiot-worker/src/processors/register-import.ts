import type { Job } from 'bullmq';
import { Client } from 'minio';

import { ImportRefused, processRegisterImport, type ImportDeps } from '../import/register-import';
import { prisma } from '../prisma';
import type { RegisterImportJob } from '../queues';

// The staged import's worker side (stage 2.13): files from MinIO, and the
// commit through the API's internal import endpoints, authorised by the
// shared INTERNAL_API_TOKEN. Those endpoints are not behind nginx.

const IMPORT_BUCKET = process.env.MINIO_DOCUMENTS_BUCKET ?? 'vairiot-documents';
const API = process.env.API_INTERNAL_URL || 'http://vairiot_api:3001';

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'vairiot-minio',
  secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'changeme-minio',
});

async function readObject(key: string): Promise<Buffer> {
  const stream = await minio.getObject(IMPORT_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Calls an internal import endpoint; a 4xx is a refusal the batch records, anything else a failure to retry. */
async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/internal/imports${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status >= 400 && res.status < 500) throw new ImportRefused(data.error ?? `The API refused the import (${res.status})`);
  if (!res.ok) throw new Error(`Internal import call failed: ${res.status}`);
  return data;
}

const deps: ImportDeps = {
  db: prisma,
  readObject,
  api: {
    commitStart: (tenantId, batchId) => call(`/${batchId}/commit-start`, { tenantId }),
    commitChunk: (tenantId, batchId, rowIds) => call(`/${batchId}/commit-chunk`, { tenantId, rowIds }),
  },
};

export async function handleRegisterImport(job: Job<RegisterImportJob>): Promise<void> {
  await processRegisterImport(deps, job.data);
}
