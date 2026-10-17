import type { Express } from 'express';
import request from 'supertest';
import { ImportRefused, processRegisterImport, type ImportDeps } from 'vairiot-worker/import/register-import';

import { minioClient } from '../../lib/minio';
import { prisma } from '../../lib/prisma';

// Runs a whole staged import from a test (stage 2.14, which removed the old
// one-shot POST /assets/import): rows keyed by import field become a CSV with
// those headers, mapped one to one, and each step is worked by the worker's
// own job, the commit through the internal endpoints. MinIO is stood in for.

export const INTERNAL_TOKEN = 'test-internal-token-0123456789-abcdefghij';
process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;

const files = new Map<string, Buffer>();
let stubbed = false;
function stubStorage() {
  if (stubbed) return;
  stubbed = true;
  jest.spyOn(minioClient, 'putObject').mockImplementation((async (_b: string, key: string, body: Buffer) => {
    files.set(key, Buffer.from(body));
  }) as never);
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export interface ImportOutcome {
  batchId: string;
  status: string;
  created: number;
  /** Rows left out, with their spreadsheet row number (the header is row 1). */
  errors: Array<{ row: number; message: string }>;
  jobError: string | null;
}

export async function stagedImport(app: Express, auth: string, tenantId: string, rows: Array<Record<string, string>>, mode: 'CREATE' | 'UPDATE' = 'CREATE'): Promise<ImportOutcome> {
  stubStorage();
  const internal = (path: string, body: Record<string, unknown>) => request(app).post(`/internal/imports${path}`).set('x-internal-token', INTERNAL_TOKEN).send(body);
  const deps: ImportDeps = {
    db: prisma,
    readObject: async (key) => files.get(key)!,
    api: {
      commitStart: async (t, b) => { const r = await internal(`/${b}/commit-start`, { tenantId: t }); if (r.status !== 200) throw new ImportRefused(r.body.error); },
      commitChunk: async (t, b, rowIds) => (await internal(`/${b}/commit-chunk`, { tenantId: t, rowIds })).body,
    },
  };
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h] ?? '')).join(','))].join('\n');
  const up = await request(app).post('/api/v1/imports').set('Authorization', auth).field('mode', mode).attach('file', Buffer.from(csv), 'rows.csv');
  if (up.status !== 202) throw new Error(`upload refused: ${up.status} ${JSON.stringify(up.body)}`);
  const batchId: string = up.body.id;
  const work = (step: 'parse' | 'validate' | 'commit') => processRegisterImport(deps, { tenantId, batchId, step });
  await work('parse');
  await request(app).put(`/api/v1/imports/${batchId}/mapping`).set('Authorization', auth)
    .send({ mapping: { fields: Object.fromEntries(headers.map((h) => [h, h])) } });
  await work('validate');
  const commit = await request(app).post(`/api/v1/imports/${batchId}/commit`).set('Authorization', auth);
  if (commit.status === 202) await work('commit');
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const failed = await prisma.importRow.findMany({ where: { batchId, status: 'ERROR' }, orderBy: { rowNumber: 'asc' } });
  return {
    batchId, status: batch.status, created: batch.committedCount, jobError: batch.jobError,
    errors: failed.flatMap((r) => (r.messages as Array<{ level: string; message: string }>).filter((m) => m.level === 'error').map((m) => ({ row: r.rowNumber, message: m.message }))),
  };
}
