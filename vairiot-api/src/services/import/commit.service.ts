import type { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { enforceAssetCap } from '../asset-cap.service';
import { recordAssetEvent } from '../asset-event.service';
import { createAsset, nextAssetNumber, updateAsset, type AssetCreateInput } from '../asset.service';
import { recordAuditEvent } from '../audit-event.service';

// Committing a staged import (stage 2.13), called by the worker through the
// internal endpoints, chunk by chunk, so assets are created and updated by the
// same code as everywhere else: numbers, GS1 reference, recognition, ledger
// events, webhooks. Each row also gets its FINANCE_REF and LEGACY_TAG and a
// MIGRATED event. Rows already committed are skipped, so a retried chunk is
// safe. Update mode matches by FINANCE_REF (found at validation) and never
// changes the asset number; each change is recorded on the asset's ledger.
// Rows are written four at a time, to keep 10,000 rows within the budget
// (test plan §3.6): a create import reserves the chunk's asset numbers in row
// order first, so the parallel creates do not collide; a number someone else
// took meanwhile falls back to the next free one.

const PARALLEL = 4;

type Mapped = { values: Record<string, string | number>; refs: Record<string, string> };
type Message = { level: 'error' | 'warning'; field?: string; message: string };

const TEXT = ['name', 'description', 'serialNumber', 'modelNumber', 'manufacturer', 'barcode', 'rfidTag', 'supplier', 'notes',
  'purchaseOrderNumber', 'invoiceNumber', 'depreciationMethod', 'purchaseDate', 'warrantyExpiry', 'depreciationStartDate'] as const;

/** The asset fields a row sets: only those it has a value for. */
export function assetInput({ values, refs }: Mapped): Partial<AssetCreateInput> {
  const input: Partial<AssetCreateInput> & Record<string, unknown> = {};
  for (const k of TEXT) if (values[k] !== undefined) input[k] = String(values[k]);
  if (values.status !== undefined) input.status = String(values.status).toLowerCase();
  if (values.conditionGrade !== undefined) input.conditionGrade = Number(values.conditionGrade);
  else if (values.condition !== undefined) input.condition = String(values.condition).toLowerCase();
  for (const k of ['purchaseCost', 'residualValue', 'usefulLifeMonths'] as const) if (values[k] !== undefined) input[k] = Number(values[k]);
  if (values.custodian !== undefined) input.custodian = String(values.custodian).slice(0, 120);
  if (values.latitude !== undefined && values.longitude !== undefined) {
    Object.assign(input, { latitude: String(values.latitude), longitude: String(values.longitude), geoSource: 'import' });
  }
  if (refs.categoryId) input.categoryId = refs.categoryId;
  if (refs.siteId) input.siteId = refs.siteId;
  if (refs.assetClassId) input.assetClassId = refs.assetClassId;
  return input;
}

async function committing(tenantId: string, batchId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) throw new NotFoundError('Import not found');
  if (batch.status !== 'COMMITTING') throw new ConflictError('The import is not being committed', 'NOT_COMMITTING');
  return batch;
}

/** Before the first write: a create import that would pass the licence cap writes nothing (KFR-039). */
export async function commitStart(tenantId: string, batchId: string) {
  const batch = await committing(tenantId, batchId);
  if (batch.mode === 'CREATE') {
    const rows = await prisma.importRow.count({ where: { batchId, status: { in: ['VALID', 'WARNING'] } } });
    if (rows > 0) await enforceAssetCap(tenantId, rows);
  }
  return { ok: true };
}

async function identify(tenantId: string, assetId: string, scheme: 'FINANCE_REF' | 'LEGACY_TAG', value: string | number | undefined) {
  if (value === undefined || String(value).trim() === '') return;
  await prisma.assetSecondaryIdentifier.upsert({
    where: { assetId_scheme_value: { assetId, scheme, value: String(value).trim() } },
    update: {},
    create: { tenantId, assetId, scheme, value: String(value).trim(), notes: 'From a register import' },
  });
}

/** Writes the given rows; each one that fails is marked ERROR with the reason. */
export async function commitChunk(tenantId: string, batchId: string, rowIds: string[]) {
  if (!Array.isArray(rowIds) || rowIds.length === 0 || rowIds.length > 500) throw new ValidationError('rowIds: 1 to 500 rows');
  const batch = await committing(tenantId, batchId);
  const actor = batch.committedBy ?? batch.createdBy;
  const rows = await prisma.importRow.findMany({ where: { batchId, id: { in: rowIds }, status: { in: ['VALID', 'WARNING'] } }, orderBy: { rowNumber: 'asc' } });
  let committed = 0;
  let failed = 0;
  // A tenant's first GS1 reference creates its sequence, which concurrent creates would race on.
  if (batch.mode === 'CREATE' && rows.length) await prisma.$executeRaw`SELECT provision_tenant_identifier_seq(${tenantId})`;
  const first = batch.mode === 'CREATE' && rows.length ? Number((await nextAssetNumber(tenantId)).replace('AST-', '')) : 0;
  const numbers = new Map(rows.map((r, i) => [r.id, `AST-${String(first + i).padStart(6, '0')}`]));
  const one = async (row: (typeof rows)[number]) => {
    const mapped = row.mapped as Mapped;
    try {
      const input = assetInput(mapped);
      const assetId = batch.mode === 'UPDATE'
        ? (await updateAsset(tenantId, mapped.refs.assetId, actor, input)).id
        : (await createAsset(tenantId, actor, input as AssetCreateInput, numbers.get(row.id))).id;
      await identify(tenantId, assetId, 'FINANCE_REF', mapped.values.financeRef);
      await identify(tenantId, assetId, 'LEGACY_TAG', mapped.values.legacyAssetNumber);
      await recordAssetEvent({
        tenantId, assetId, eventType: 'MIGRATED', actor, source: 'MIGRATION',
        payload: { importBatchId: batchId, fileName: batch.fileName, rowNumber: row.rowNumber, mode: batch.mode },
      });
      await prisma.importRow.update({ where: { id: row.id }, data: { status: 'COMMITTED', assetId } });
      committed += 1;
    } catch (err) {
      const messages = [...(row.messages as Message[]), { level: 'error' as const, message: `Not imported: ${(err as Error).message}` }];
      await prisma.importRow.update({ where: { id: row.id }, data: { status: 'ERROR', messages: messages as unknown as Prisma.InputJsonValue } });
      failed += 1;
    }
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, rows.length) }, async () => {
    while (next < rows.length) await one(rows[next++]);
  }));
  if (committed) recordAuditEvent({ tenantId, actor, entityType: 'import_batch', entityId: batchId, action: 'rows_committed', after: { committed, failed } });
  return { committed, failed };
}
