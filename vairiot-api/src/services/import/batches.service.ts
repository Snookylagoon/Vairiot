import { Prisma, type ImportRowStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { buildGiai, importMappingSchema, mappingFromProfile, type ImportMapping } from 'vairiot-shared';

import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { DOCUMENT_BUCKET, minioClient } from '../../lib/minio';
import { prisma } from '../../lib/prisma';
import { enqueueRegisterImport } from '../../lib/queue';
import { recordAuditEvent } from '../audit-event.service';
import { getIdentification } from '../gs1-identification.service';

// Staged register imports, the API's side (Phase 2, S2.5, stage 2.13). Each
// step is checked here, recorded on the batch with its working status and
// queued for the worker (parse → PARSING, mapping → VALIDATING, commit →
// COMMITTING), which moves it on. The web polls the batch.

export const MAX_BYTES = 25 * 1024 * 1024;
const TYPES = ['.xlsx', '.csv'];

async function findBatch(tenantId: string, id: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id, tenantId } });
  if (!batch) throw new NotFoundError('Import not found');
  return batch;
}

/** Stores the file and queues it to be read. `.xls` is refused (D18). */
export async function uploadBatch(tenantId: string, actorId: string, file: { originalname: string; buffer: Buffer; size: number }, mode: 'CREATE' | 'UPDATE') {
  const name = file.originalname.trim() || 'register.xlsx';
  const lower = name.toLowerCase();
  if (lower.endsWith('.xls')) throw new ValidationError('Old .xls files are not read: save it as .xlsx and upload again');
  if (!TYPES.some((t) => lower.endsWith(t))) throw new ValidationError('Upload an .xlsx or .csv file');
  if (file.size === 0) throw new ValidationError('The file is empty');
  if (file.size > MAX_BYTES) throw new ValidationError('The file is larger than 25 MB');
  const id = (await prisma.importBatch.create({
    data: { tenantId, fileName: name, storageKey: 'pending', fileSize: file.size, mode, status: 'PARSING', createdBy: actorId },
  })).id;
  const storageKey = `imports/${tenantId}/${id}/${name.replace(/[^\w.\- ]/g, '_')}`;
  await minioClient.putObject(DOCUMENT_BUCKET, storageKey, file.buffer, file.size);
  const batch = await prisma.importBatch.update({ where: { id }, data: { storageKey } });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'import_batch', entityId: id, action: 'uploaded', after: { fileName: name, mode, size: file.size } });
  await enqueueRegisterImport({ tenantId, batchId: id, step: 'parse' });
  return batch;
}

export async function listBatches(tenantId: string) {
  return prisma.importBatch.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50, omit: { mapping: true } });
}

export const getBatch = findBatch;

export async function listRows(tenantId: string, batchId: string, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  await findBatch(tenantId, batchId);
  const status = ['PENDING', 'VALID', 'WARNING', 'ERROR', 'COMMITTED'].includes(opts.status ?? '') ? opts.status as ImportRowStatus : undefined;
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 500);
  const page = Math.max(opts.page ?? 1, 1);
  const where = { batchId, ...(status && { status }) };
  const [rows, total] = await Promise.all([
    prisma.importRow.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.importRow.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/**
 * Sets the mapping, from a mapping or the profiler's JSON, and queues the
 * rows to be validated against it. Possible once the file is read, until it
 * is committed; validating again replaces every row's result.
 */
export async function setMapping(tenantId: string, actorId: string, batchId: string, body: { mapping?: unknown; profile?: unknown; mode?: 'CREATE' | 'UPDATE' }) {
  const batch = await findBatch(tenantId, batchId);
  if (!['PARSED', 'VALIDATED', 'FAILED'].includes(batch.status) || batch.rowCount === 0) {
    throw new ConflictError('The file must be read before it is mapped, and not yet committed', 'NOT_MAPPABLE');
  }
  let mapping: ImportMapping;
  try {
    mapping = body.profile !== undefined ? mappingFromProfile(body.profile) : importMappingSchema.parse(body.mapping);
  } catch {
    throw new ValidationError('The mapping is not valid');
  }
  const missing = Object.values(mapping.fields).filter((c) => !batch.columns.includes(c));
  if (missing.length) throw new ValidationError(`The file has no column ${missing.map((c) => `"${c}"`).join(', ')}`);
  const updated = await prisma.importBatch.update({
    where: { id: batchId },
    data: { mapping: mapping as Prisma.InputJsonValue, mode: body.mode ?? batch.mode, status: 'VALIDATING', jobError: null, validCount: 0, warningCount: 0, errorCount: 0 },
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'import_batch', entityId: batchId, action: 'mapped', after: { fields: Object.keys(mapping.fields).length, mode: updated.mode } });
  await enqueueRegisterImport({ tenantId, batchId, step: 'validate' });
  return updated;
}

/** Queues the VALID and WARNING rows to be written; ERROR rows are left out. */
export async function commitBatch(tenantId: string, actorId: string, batchId: string) {
  const batch = await findBatch(tenantId, batchId);
  if (batch.status !== 'VALIDATED') throw new ConflictError('Validate the import before committing it', 'NOT_VALIDATED');
  if (batch.validCount + batch.warningCount === 0) throw new ConflictError('No row can be imported', 'NOTHING_TO_COMMIT');
  const updated = await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'COMMITTING', committedBy: actorId, jobError: null } });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'import_batch', entityId: batchId, action: 'commit_requested', after: { rows: batch.validCount + batch.warningCount, mode: batch.mode } });
  await enqueueRegisterImport({ tenantId, batchId, step: 'commit' });
  return updated;
}

export async function cancelBatch(tenantId: string, actorId: string, batchId: string) {
  const batch = await findBatch(tenantId, batchId);
  if (['COMMITTING', 'COMMITTED', 'CANCELLED'].includes(batch.status)) throw new ConflictError('The import can no longer be cancelled', 'NOT_CANCELLABLE');
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'import_batch', entityId: batchId, action: 'cancelled' });
  return prisma.importBatch.update({ where: { id: batchId }, data: { status: 'CANCELLED' } });
}

// ── Saved mappings ───────────────────────────────────────────────────────────

export async function listMappings(tenantId: string) {
  return prisma.importMapping.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
}

export async function saveMapping(tenantId: string, actorId: string, name: string, mapping: ImportMapping) {
  return prisma.importMapping.upsert({
    where: { tenantId_name: { tenantId, name } },
    update: { mapping: mapping as Prisma.InputJsonValue },
    create: { tenantId, name, mapping: mapping as Prisma.InputJsonValue, createdBy: actorId },
  });
}

// ── Downloads ────────────────────────────────────────────────────────────────

type Message = { level: string; message: string };

/** The ERROR rows as the file had them, with what is wrong, to fix and upload again. */
export async function errorRowsWorkbook(tenantId: string, batchId: string): Promise<Buffer> {
  const batch = await findBatch(tenantId, batchId);
  const rows = await prisma.importRow.findMany({ where: { batchId, status: 'ERROR' }, orderBy: { rowNumber: 'asc' } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rows to fix');
  ws.addRow(['Row', ...batch.columns, 'What to fix']).font = { bold: true };
  for (const r of rows) {
    const raw = r.raw as Record<string, unknown>;
    ws.addRow([r.rowNumber, ...batch.columns.map((c) => raw[c] ?? null), (r.messages as Message[]).filter((m) => m.level === 'error').map((m) => m.message).join('; ')]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Each source row with the asset it became: asset number, GIAI and finance reference (S2.5 step 7). */
export async function reconciliationWorkbook(tenantId: string, batchId: string): Promise<Buffer> {
  await findBatch(tenantId, batchId);
  const rows = await prisma.importRow.findMany({ where: { batchId }, orderBy: { rowNumber: 'asc' }, select: { rowNumber: true, status: true, assetId: true, mapped: true, messages: true } });
  const ids = rows.flatMap((r) => (r.assetId ? [r.assetId] : []));
  const assets = new Map((await prisma.asset.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, assetNumber: true, individualAssetReference: true, name: true } })).map((a) => [a.id, a]));
  const prefix = (await getIdentification(tenantId)).activePrefix?.prefix ?? null;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reconciliation');
  ws.addRow(['Source row', 'Status', 'Asset number', 'GIAI', 'Name', 'Finance reference', 'Legacy asset number', 'Messages']).font = { bold: true };
  for (const r of rows) {
    const a = r.assetId ? assets.get(r.assetId) : undefined;
    const values = ((r.mapped as { values?: Record<string, unknown> } | null)?.values ?? {});
    ws.addRow([
      r.rowNumber, r.status, a?.assetNumber ?? '', a?.individualAssetReference && prefix ? buildGiai(prefix, a.individualAssetReference) : '',
      a?.name ?? values.name ?? '', values.financeRef ?? '', values.legacyAssetNumber ?? '', (r.messages as Message[]).map((m) => m.message).join('; '),
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
