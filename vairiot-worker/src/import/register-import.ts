import type { Prisma, PrismaClient } from '@prisma/client';
import {
  GRADE_FROM_CONDITION, importMappingSchema, mapRow, type Cell, type ImportMapping, type RegisterImportJob, type RowMessage,
} from 'vairiot-shared';

import { FileRefused, readRegister } from './read-file';

// The staged register import, worked by the worker (Phase 2, S2.5, stage
// 2.13). The API stores the upload and the mapping and queues each step; this
// does the step and records it on the batch, which the web polls:
// - parse: the file into import_rows (raw cells keyed by header);
// - validate: each row against the mapping and the register — required
//   fields, lookups, dates and numbers, positions, duplicates in the file and
//   against the register, the class threshold — as VALID, WARNING or ERROR;
// - commit: the VALID and WARNING rows, 500 at a time, through the API's own
//   asset create or update (internal endpoint), so there is one path that
//   numbers assets, writes their identifiers and records their events.

export interface ImportDeps {
  db: PrismaClient;
  readObject: (storageKey: string) => Promise<Buffer>;
  api: {
    /** Checks the licence cap for the whole batch before the first write (KFR-039). */
    commitStart: (tenantId: string, batchId: string) => Promise<void>;
    commitChunk: (tenantId: string, batchId: string, rowIds: string[]) => Promise<{ committed: number; failed: number }>;
  };
}

export class ImportRefused extends Error {}

export const CHUNK = 500;
const STATUSES = new Set(['active', 'inactive', 'in_use', 'maintenance', 'disposed']);

type Batch = NonNullable<Awaited<ReturnType<PrismaClient['importBatch']['findFirst']>>>;

async function parse(deps: ImportDeps, batch: Batch) {
  let file;
  try {
    file = await readRegister(await deps.readObject(batch.storageKey), batch.fileName);
  } catch (err) {
    if (err instanceof FileRefused) throw new ImportRefused(err.message);
    throw err;
  }
  if (file.rows.length > 50_000) throw new ImportRefused(`The file has ${file.rows.length} rows; split it into files of 50,000 or fewer`);
  await deps.db.importRow.deleteMany({ where: { batchId: batch.id } });
  for (let i = 0; i < file.rows.length; i += 1000) {
    await deps.db.importRow.createMany({
      data: file.rows.slice(i, i + 1000).map((r) => ({ tenantId: batch.tenantId, batchId: batch.id, rowNumber: r.rowNumber, raw: r.raw as Prisma.InputJsonValue })),
    });
  }
  await deps.db.importBatch.update({
    where: { id: batch.id },
    data: { status: 'PARSED', sheetName: file.sheetName, headerRow: file.headerRow, columns: file.columns, rowCount: file.rows.length },
  });
}

/** What validation needs from the register, read once per batch. */
async function lookups(db: PrismaClient, tenantId: string) {
  const flags = await db.tenant.findUnique({ where: { id: tenantId }, select: { featureFlags: true } })
    .then((t) => (t?.featureFlags ?? {}) as Record<string, unknown>);
  const ipsas = flags.ipsas === true;
  const [classes, sites, categories, refs, serials] = await Promise.all([
    ipsas ? db.assetClass.findMany({ where: { tenantId, active: true }, select: { id: true, code: true, capitalisationThreshold: true } }) : [],
    db.site.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    db.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    db.assetSecondaryIdentifier.findMany({ where: { tenantId, scheme: 'FINANCE_REF', validTo: null, asset: { deletedAt: null } }, select: { value: true, assetId: true } }),
    db.asset.findMany({ where: { tenantId, deletedAt: null, serialNumber: { not: null } }, select: { serialNumber: true } }),
  ]);
  const byRef = new Map<string, string[]>();
  for (const r of refs) byRef.set(r.value, [...(byRef.get(r.value) ?? []), r.assetId]);
  return {
    ipsas,
    gis: flags.gis === true,
    classes: new Map(classes.map((c) => [c.code.toUpperCase(), c])),
    sites: new Map(sites.map((s) => [s.name.trim().toLowerCase(), s.id])),
    categories: new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id])),
    byRef,
    serials: new Set(serials.map((s) => s.serialNumber!.trim().toLowerCase())),
  };
}

type Lookups = Awaited<ReturnType<typeof lookups>>;

/** One row's values, the register ids they resolve to, and its messages. */
export function checkRow(
  raw: Record<string, Cell>, mapping: ImportMapping, mode: 'CREATE' | 'UPDATE', l: Lookups,
  seen: { financeRef: Map<string, number>; serialNumber: Map<string, number>; legacyAssetNumber: Map<string, number> }, rowNumber: number,
) {
  const { values, messages } = mapRow(raw, mapping);
  const refs: Record<string, string> = {};
  const err = (message: string, field?: RowMessage['field']) => messages.push({ level: 'error', field, message });
  const warn = (message: string, field?: RowMessage['field']) => messages.push({ level: 'warning', field, message });
  const str = (k: keyof typeof values) => (values[k] === undefined ? undefined : String(values[k]));

  if (mode === 'CREATE' && !str('name')) err('Name is required', 'name');
  const ref = str('financeRef');
  if (mode === 'UPDATE') {
    if (!ref) err('The finance reference is required in update mode', 'financeRef');
    else {
      const ids = l.byRef.get(ref) ?? [];
      if (ids.length === 1) refs.assetId = ids[0];
      else err(ids.length === 0 ? `No asset has finance reference ${ref}` : `${ids.length} assets have finance reference ${ref}`, 'financeRef');
    }
  } else if (ref && l.byRef.has(ref)) {
    err(`An asset with finance reference ${ref} is already on the register: import it in update mode`, 'financeRef');
  }

  for (const key of ['financeRef', 'serialNumber', 'legacyAssetNumber'] as const) {
    const v = str(key)?.toLowerCase();
    if (!v) continue;
    const first = seen[key].get(v);
    if (first !== undefined) err(`Same ${key === 'financeRef' ? 'finance reference' : key === 'serialNumber' ? 'serial number' : 'legacy asset number'} as row ${first}`, key);
    else seen[key].set(v, rowNumber);
  }
  const serial = str('serialNumber');
  if (mode === 'CREATE' && serial && l.serials.has(serial.toLowerCase())) warn(`Serial number ${serial} is already on the register`, 'serialNumber');

  const code = str('classCode');
  let threshold: number | null = null;
  if (code) {
    if (!l.ipsas) warn('Asset classes are not used by this organisation: the class is ignored', 'classCode');
    else {
      const c = l.classes.get(code.toUpperCase());
      if (c) { refs.assetClassId = c.id; threshold = Number(c.capitalisationThreshold); } else err(`Unknown asset class ${code}`, 'classCode');
    }
  }
  const site = str('siteName');
  if (site) { const id = l.sites.get(site.toLowerCase()); if (id) refs.siteId = id; else err(`Unknown site ${site}`, 'siteName'); }
  const category = str('categoryName');
  if (category) { const id = l.categories.get(category.toLowerCase()); if (id) refs.categoryId = id; else err(`Unknown category ${category}`, 'categoryName'); }

  const condition = str('condition');
  if (condition && !(condition.toLowerCase() in GRADE_FROM_CONDITION)) err(`Unknown condition ${condition}`, 'condition');
  const grade = values.conditionGrade;
  if (grade !== undefined && !(Number(grade) >= 1 && Number(grade) <= 5)) err('The grade must be 1 to 5', 'conditionGrade');
  const status = str('status');
  if (status && !STATUSES.has(status.toLowerCase())) err(`Unknown status ${status}`, 'status');

  const lat = values.latitude;
  const lng = values.longitude;
  if ((lat === undefined) !== (lng === undefined)) err('A position needs both latitude and longitude', lat === undefined ? 'latitude' : 'longitude');
  if ((lat !== undefined || lng !== undefined) && !l.gis) warn('Map positions are not used by this organisation: the position is ignored', 'latitude');
  if (lat !== undefined && !(Math.abs(Number(lat)) <= 90)) err('Latitude must be between -90 and 90', 'latitude');
  if (lng !== undefined && !(Math.abs(Number(lng)) <= 180)) err('Longitude must be between -180 and 180', 'longitude');

  const cost = values.purchaseCost;
  if (cost !== undefined && Number(cost) < 0) err('The cost cannot be negative', 'purchaseCost');
  const life = values.usefulLifeMonths;
  if (life !== undefined && !(Number(life) > 0 && Number(life) <= 1200)) err('The useful life must be 1 to 1,200 months', 'usefulLifeMonths');
  if (threshold !== null && cost !== undefined && Number(cost) < threshold) {
    warn(`Below the class threshold of ${threshold}: it will be EXPENSED, not recognised`, 'purchaseCost');
  }

  const status_ = messages.some((m) => m.level === 'error') ? 'ERROR' as const : messages.length ? 'WARNING' as const : 'VALID' as const;
  return { values, refs, messages, status: status_ };
}

async function validate(db: PrismaClient, batch: Batch) {
  const parsed = importMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new ImportRefused('The mapping is missing or not valid');
  const mapping = parsed.data;
  const unknown = Object.values(mapping.fields).filter((c) => !batch.columns.includes(c));
  if (unknown.length) throw new ImportRefused(`The file has no column ${unknown.map((c) => `"${c}"`).join(', ')}`);
  if (batch.mode === 'CREATE' && !mapping.fields.name) throw new ImportRefused('Map a column to the asset name');
  if (batch.mode === 'UPDATE' && !mapping.fields.financeRef) throw new ImportRefused('Map a column to the finance reference to update by it');

  const l = await lookups(db, batch.tenantId);
  const seen = { financeRef: new Map<string, number>(), serialNumber: new Map<string, number>(), legacyAssetNumber: new Map<string, number>() };
  const counts = { VALID: 0, WARNING: 0, ERROR: 0 };
  for (let cursor = 0; ; ) {
    const rows = await db.importRow.findMany({ where: { batchId: batch.id, rowNumber: { gt: cursor } }, orderBy: { rowNumber: 'asc' }, take: 1000 });
    if (rows.length === 0) break;
    const updates = rows.map((r) => {
      const c = checkRow(r.raw as Record<string, Cell>, mapping, batch.mode, l, seen, r.rowNumber);
      counts[c.status] += 1;
      return db.importRow.update({
        where: { id: r.id },
        data: { mapped: { values: c.values, refs: c.refs } as Prisma.InputJsonValue, status: c.status, messages: c.messages as unknown as Prisma.InputJsonValue },
      });
    });
    for (let i = 0; i < updates.length; i += CHUNK) await db.$transaction(updates.slice(i, i + CHUNK));
    cursor = rows[rows.length - 1].rowNumber;
  }
  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: 'VALIDATED', validCount: counts.VALID, warningCount: counts.WARNING, errorCount: counts.ERROR },
  });
}

async function commit(deps: ImportDeps, batch: Batch) {
  await deps.api.commitStart(batch.tenantId, batch.id);
  let committed = 0;
  // The API moves every row it is given to COMMITTED or ERROR, so each pass
  // takes the next ones; the bound only guards against a fault there.
  const passes = Math.ceil((await deps.db.importRow.count({ where: { batchId: batch.id, status: { in: ['VALID', 'WARNING'] } } })) / CHUNK) + 1;
  for (let pass = 0; pass < passes; pass++) {
    // Rows the API commits change status, so each chunk is the next not yet done.
    const rows = await deps.db.importRow.findMany({
      where: { batchId: batch.id, status: { in: ['VALID', 'WARNING'] } }, orderBy: { rowNumber: 'asc' }, take: CHUNK, select: { id: true },
    });
    if (rows.length === 0) break;
    const r = await deps.api.commitChunk(batch.tenantId, batch.id, rows.map((x) => x.id));
    committed += r.committed;
    await deps.db.importBatch.update({ where: { id: batch.id }, data: { committedCount: { increment: r.committed }, errorCount: { increment: r.failed } } });
  }
  await deps.db.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: new Date() } });
  return committed;
}

const WORKING = { parse: 'PARSING', validate: 'VALIDATING', commit: 'COMMITTING' } as const;

/**
 * Works one step of a batch and records the outcome: the next status, or
 * FAILED with the reason. A refusal (a bad file or mapping) is not rethrown.
 */
export async function processRegisterImport(deps: ImportDeps, job: RegisterImportJob): Promise<void> {
  const batch = await deps.db.importBatch.findFirst({ where: { id: job.batchId, tenantId: job.tenantId } });
  if (!batch || batch.status !== WORKING[job.step]) return;
  try {
    if (job.step === 'parse') await parse(deps, batch);
    else if (job.step === 'validate') await validate(deps.db, batch);
    else await commit(deps, batch);
  } catch (err) {
    await deps.db.importBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', jobError: (err as Error).message.slice(0, 500) } });
    if (!(err instanceof ImportRefused)) throw err;
  }
}
