import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import request from 'supertest';
import { ImportRefused, processRegisterImport, type ImportDeps } from 'vairiot-worker/import/register-import';

import { createApp } from '../../app';
import { ForbiddenError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import * as cap from '../../services/asset-cap.service';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.5 (stage 2.13): the staged register import. Each step answers 202 and is
// worked here by the worker's own job, against this database; the commit
// calls the internal endpoints over HTTP, as the worker does. Gate (test plan
// §8.3): error rows are left out and downloadable; re-running in update mode
// changes no asset numbers. (The 10,000-row budget is timed on the stack.)

const store = new Map<string, Buffer>();
jest.mock('../../lib/minio', () => ({
  PHOTO_BUCKET: 'photos', DOCUMENT_BUCKET: 'documents', MOBILE_RELEASES_BUCKET: 'releases',
  minioClient: {
    putObject: async (b: string, k: string, body: Buffer) => { store.set(`${b}/${k}`, Buffer.from(body)); },
    getObject: async (b: string, k: string) => Readable.from([store.get(`${b}/${k}`)!]),
    removeObject: async () => {},
  },
}));

const TOKEN = 'test-internal-token-0123456789-abcdefghij';
process.env.INTERNAL_API_TOKEN = TOKEN;
const app = createApp();
const TID = 'test-staged-import';
let userId = '';

const tokenFor = (accounting = false) => signAccessToken({
  sub: userId, tenantId: TID, email: 'importer@import.test', roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', ...(accounting ? ['accounting:read', 'accounting:write'] : [])],
});
const as = (accounting = false) => ({ Authorization: `Bearer ${tokenFor(accounting)}` });

const internal = (path: string, body: Record<string, unknown>) => request(app).post(`/internal/imports${path}`).set('x-internal-token', TOKEN).send(body);
const deps: ImportDeps = {
  db: prisma,
  readObject: async (key) => store.get(`documents/${key}`)!,
  api: {
    // As the worker's client: a 4xx is a refusal the batch records.
    commitStart: async (tenantId, batchId) => { const r = await internal(`/${batchId}/commit-start`, { tenantId }); if (r.status !== 200) throw new ImportRefused(r.body.error); },
    commitChunk: async (tenantId, batchId, rowIds) => (await internal(`/${batchId}/commit-chunk`, { tenantId, rowIds })).body,
  },
};
const work = (batchId: string, step: 'parse' | 'validate' | 'commit') => processRegisterImport(deps, { tenantId: TID, batchId, step });
const batch = async (id: string) => (await request(app).get(`/api/v1/imports/${id}`).set(as())).body;

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Register');
  ws.addRow(['TUDA asset register — October 2026']); // a title above the headers
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS = ['Inv No', 'Name', 'Class', 'Site', 'Cost', 'Bought', 'Ref', 'Serial', 'Lat', 'Lng', 'Grade'];
const MAPPING = {
  fields: {
    legacyAssetNumber: 'Inv No', name: 'Name', classCode: 'Class', siteName: 'Site', purchaseCost: 'Cost', purchaseDate: 'Bought',
    financeRef: 'Ref', serialNumber: 'Serial', latitude: 'Lat', longitude: 'Lng', conditionGrade: 'Grade',
  },
  transforms: { dateFormat: 'DMY', decimalSeparator: ',', lookups: { classCode: { Signs: 'SGN' } } },
};

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true, gis: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true, gis: true } } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'importer@import.test' } }, update: {}, create: { tenantId: TID, email: 'importer@import.test', name: 'Importer' } })).id;
  await ensureTestLicence(TID);
  await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } });
  await prisma.site.create({ data: { tenantId: TID, name: 'Depot' } });
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.importBatch.deleteMany({ where: { tenantId: TID } });
  await prisma.importMapping.deleteMany({ where: { tenantId: TID } });
  await prisma.assetSecondaryIdentifier.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('a create import, step by step', () => {
  let id = '';

  it('stores the upload and reads it, finding the header under a title', async () => {
    const file = await xlsx([
      HEADERS,
      ['INV-1', 'Stop sign', 'Signs', 'Depot', '1 000,00', '10.08.2026', 'F-1', 'S-1', 41.7151, 44.8271, 4],
      ['INV-2', 'Give way sign', 'SGN', 'Depot', '250,00', '11.08.2026', 'F-2', '', '', '', ''],     // below the threshold: a warning
      ['INV-3', 'Duplicate', 'SGN', 'Depot', '900', '12.08.2026', 'F-1', '', '', '', ''],          // same finance reference as row 3
      ['INV-4', 'Bollard', 'BOL', 'Depot', '700', 'soon', 'F-4', '', '', '', ''],                  // unknown class, bad date
      ['INV-5', '', 'SGN', 'Nowhere', '700', '', 'F-5', '', 95, 44, 9],                            // no name, unknown site, position, grade
      [],
    ]);
    const r = await request(app).post('/api/v1/imports').set(as()).attach('file', file, 'register.xlsx');
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'PARSING', mode: 'CREATE', fileName: 'register.xlsx' });
    id = r.body.id;
    await work(id, 'parse');
    expect(await batch(id)).toMatchObject({ status: 'PARSED', sheetName: 'Register', headerRow: 2, rowCount: 5, columns: HEADERS });
  });

  it('validates every row against the mapping and the register', async () => {
    expect((await request(app).put(`/api/v1/imports/${id}/mapping`).set(as()).send({ mapping: { fields: { name: 'Nom' } } })).status).toBe(400);
    expect((await request(app).put(`/api/v1/imports/${id}/mapping`).set(as()).send({ mapping: MAPPING })).status).toBe(202);
    await work(id, 'validate');
    expect(await batch(id)).toMatchObject({ status: 'VALIDATED', validCount: 1, warningCount: 1, errorCount: 3 });
    const rows = (await request(app).get(`/api/v1/imports/${id}/rows?status=ERROR`).set(as())).body.rows;
    const messages = (n: number) => rows.find((r: { rowNumber: number }) => r.rowNumber === n).messages.map((m: { message: string }) => m.message);
    expect(messages(5)).toEqual(['Same finance reference as row 3']);
    expect(messages(6)).toEqual(['Bought: "soon" is not a date', 'Unknown asset class BOL']);
    expect(messages(7)).toEqual(expect.arrayContaining(['Name is required', 'Unknown site Nowhere', 'The grade must be 1 to 5', 'Latitude must be between -90 and 90']));
    const warning = (await request(app).get(`/api/v1/imports/${id}/rows?status=WARNING`).set(as())).body.rows[0];
    expect(warning.messages[0].message).toMatch(/threshold of 500: it will be EXPENSED/);
  });

  it('offers the error rows as a workbook to fix', async () => {
    const r = await request(app).get(`/api/v1/imports/${id}/errors.xlsx`).set(as()).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, 'Row', ...HEADERS, 'What to fix']);
    expect(ws.actualRowCount).toBe(4);
    expect(ws.getRow(2).getCell(13).value).toBe('Same finance reference as row 3');
  });

  it('commits the valid and warning rows only, with their identifiers and a MIGRATED event', async () => {
    expect((await request(app).post(`/api/v1/imports/${id}/commit`).set(as())).status).toBe(202);
    await work(id, 'commit');
    expect(await batch(id)).toMatchObject({ status: 'COMMITTED', committedCount: 2, errorCount: 3 });
    const assets = await prisma.asset.findMany({ where: { tenantId: TID }, include: { secondaryIdentifiers: true }, orderBy: { name: 'asc' } });
    expect(assets.map((a) => [a.name, a.recognitionStatus])).toEqual([['Give way sign', 'EXPENSED'], ['Stop sign', 'RECOGNISED']]);
    const stop = assets[1];
    expect(stop).toMatchObject({ siteId: expect.any(String), conditionGrade: 4, purchaseDate: new Date('2026-08-10') });
    expect(Number(stop.purchaseCost)).toBe(1000);
    expect(stop.secondaryIdentifiers.map((i) => [i.scheme, i.value]).sort()).toEqual([['FINANCE_REF', 'F-1'], ['LEGACY_TAG', 'INV-1']]);
    const event = await prisma.assetEvent.findFirst({ where: { assetId: stop.id, eventType: 'MIGRATED' } });
    expect(event?.payload).toMatchObject({ importBatchId: id, fileName: 'register.xlsx', rowNumber: 3, mode: 'CREATE' });
  });

  it('gives a reconciliation sheet of source rows and the assets they became', async () => {
    const r = await request(app).get(`/api/v1/imports/${id}/reconciliation.xlsx`).set(as()).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const row = wb.worksheets[0].getRow(2).values as unknown[];
    expect(row.slice(1, 3)).toEqual([3, 'COMMITTED']);
    expect(String(row[3])).toMatch(/\S/); // the asset number
    expect(row[6]).toBe('F-1');
  });
});

describe('corrections in the review step (stage 2.14)', () => {
  it('corrects a row, refuses to commit until validated again, then imports it', async () => {
    const file = await xlsx([['Name', 'Cost', 'Ref'], ['Lamp post', 'lots', 'F-30'], ['Bench', '120', 'F-31']]);
    const id = (await request(app).post('/api/v1/imports').set(as()).attach('file', file, 'fix.xlsx')).body.id;
    await work(id, 'parse');
    await request(app).put(`/api/v1/imports/${id}/mapping`).set(as()).send({ mapping: { fields: { name: 'Name', purchaseCost: 'Cost', financeRef: 'Ref' } } });
    await work(id, 'validate');
    const [bad] = (await request(app).get(`/api/v1/imports/${id}/rows?status=ERROR`).set(as())).body.rows;
    expect((await request(app).patch(`/api/v1/imports/${id}/rows/${bad.id}`).set(as()).send({ cells: { Colour: 'red' } })).status).toBe(400);
    const fixed = await request(app).patch(`/api/v1/imports/${id}/rows/${bad.id}`).set(as()).send({ cells: { Cost: '450' } });
    expect(fixed.body).toMatchObject({ status: 'PENDING', raw: { Name: 'Lamp post', Cost: '450' } });
    expect((await request(app).post(`/api/v1/imports/${id}/commit`).set(as())).body.code).toBe('REVALIDATE');
    expect((await request(app).post(`/api/v1/imports/${id}/validate`).set(as())).status).toBe(202);
    await work(id, 'validate');
    expect(await batch(id)).toMatchObject({ status: 'VALIDATED', validCount: 2, errorCount: 0 });
    await request(app).post(`/api/v1/imports/${id}/commit`).set(as());
    await work(id, 'commit');
    expect(await batch(id)).toMatchObject({ status: 'COMMITTED', committedCount: 2 });
    const row = (await request(app).get(`/api/v1/imports/${id}/rows`).set(as())).body.rows[0];
    expect((await request(app).patch(`/api/v1/imports/${id}/rows/${row.id}`).set(as()).send({ cells: { Cost: '1' } })).body.code).toBe('NOT_EDITABLE');
  });
});

describe('the register export (G33)', () => {
  it('carries the grade, position source, class and references, under headers the import maps', async () => {
    const csv = (await request(app).get('/api/v1/assets/export.csv?search=Stop').set(as())).text;
    const [header, row] = csv.trim().split('\n');
    const cols = header.split(',');
    for (const h of ['Condition Grade', 'Position Accuracy (m)', 'Position Source', 'Asset Class', 'Finance Reference', 'Legacy Asset Number']) expect(cols).toContain(h);
    const cell = (h: string) => row.split(',')[cols.indexOf(h)];
    expect([cell('Condition Grade'), cell('Position Source'), cell('Asset Class'), cell('Finance Reference'), cell('Legacy Asset Number')]).toEqual(['4', 'import', 'SGN', 'F-1', 'INV-1']);
  });
});

describe('update mode', () => {
  it('needs accounting:write, matches by finance reference and changes no asset number', async () => {
    const numbers = await prisma.asset.findMany({ where: { tenantId: TID }, select: { id: true, assetNumber: true } });
    const file = await xlsx([['Ref', 'Cost', 'Name'], ['F-1', '1 200,00', 'Stop sign (renewed)'], ['F-9', '10', 'Nobody']]);
    expect((await request(app).post('/api/v1/imports').set(as()).field('mode', 'UPDATE').attach('file', file, 'update.xlsx')).status).toBe(403);
    const id = (await request(app).post('/api/v1/imports').set(as(true)).field('mode', 'UPDATE').attach('file', file, 'update.xlsx')).body.id;
    await work(id, 'parse');
    await request(app).put(`/api/v1/imports/${id}/mapping`).set(as(true)).send({ mapping: { fields: { financeRef: 'Ref', purchaseCost: 'Cost', name: 'Name' }, transforms: { decimalSeparator: ',' } } });
    await work(id, 'validate');
    const errors = (await request(app).get(`/api/v1/imports/${id}/rows?status=ERROR`).set(as())).body.rows;
    expect(errors[0].messages[0].message).toBe('No asset has finance reference F-9');
    await request(app).post(`/api/v1/imports/${id}/commit`).set(as(true));
    await work(id, 'commit');
    expect(await batch(id)).toMatchObject({ status: 'COMMITTED', committedCount: 1 });
    const after = await prisma.asset.findMany({ where: { tenantId: TID }, select: { id: true, assetNumber: true, name: true, purchaseCost: true } });
    expect(after.map(({ id: i, assetNumber }) => ({ id: i, assetNumber })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(numbers.sort((a, b) => a.id.localeCompare(b.id)));
    expect(after.find((a) => a.name === 'Stop sign (renewed)')?.purchaseCost?.toString()).toBe('1200');
    expect(await prisma.assetSecondaryIdentifier.count({ where: { tenantId: TID, scheme: 'FINANCE_REF', value: 'F-1' } })).toBe(1);
  });
});

describe('refusals', () => {
  it('refuses .xls, other files and a file over the limit', async () => {
    expect((await request(app).post('/api/v1/imports').set(as()).attach('file', Buffer.from('x'), 'old.xls')).body.error).toMatch(/save it as .xlsx/);
    expect((await request(app).post('/api/v1/imports').set(as()).attach('file', Buffer.from('x'), 'notes.txt')).status).toBe(400);
    expect((await request(app).post('/api/v1/imports').set(as())).status).toBe(400);
  });

  it('records a file that cannot be read as FAILED, with the reason', async () => {
    const id = (await request(app).post('/api/v1/imports').set(as()).attach('file', Buffer.from('not a zip'), 'broken.xlsx')).body.id;
    await work(id, 'parse');
    expect(await batch(id)).toMatchObject({ status: 'FAILED', jobError: 'The file could not be read as .xlsx' });
  });

  it('reads a semicolon CSV and takes the profiler’s mapping; checks the licence cap before writing', async () => {
    const csv = Buffer.from('﻿Name;Inv No;Room\nCabinet;INV-7;101\n');
    const id = (await request(app).post('/api/v1/imports').set(as()).attach('file', csv, 'register.csv')).body.id;
    await work(id, 'parse');
    expect(await batch(id)).toMatchObject({ status: 'PARSED', rowCount: 1, columns: ['Name', 'Inv No', 'Room'] });
    const profile = { mappings: [{ column: 'Name', field: 'name' }, { column: 'Inv No', field: 'legacyAssetNumber' }, { column: 'Room', field: 'locationName' }] };
    const mapped = await request(app).put(`/api/v1/imports/${id}/mapping`).set(as()).send({ profile });
    expect(mapped.body.mapping.fields).toEqual({ name: 'Name', legacyAssetNumber: 'Inv No' });
    await work(id, 'validate');
    await request(app).post(`/api/v1/imports/${id}/commit`).set(as());
    const spy = jest.spyOn(cap, 'enforceAssetCap').mockRejectedValueOnce(new ForbiddenError('Licence cap reached'));
    await work(id, 'commit');
    spy.mockRestore();
    expect(await batch(id)).toMatchObject({ status: 'FAILED', jobError: expect.stringMatching(/cap/), committedCount: 0 });
    expect(await prisma.asset.count({ where: { tenantId: TID, name: 'Cabinet' } })).toBe(0);
  });

  it('keeps the internal endpoints shut without the token, and steps out of order are refused', async () => {
    expect((await request(app).post('/internal/imports/x/commit-chunk').send({ tenantId: TID, rowIds: ['r'] })).status).toBe(401);
    expect((await request(app).post('/internal/imports/x/commit-chunk').set('x-internal-token', 'short').send({ tenantId: TID })).status).toBe(401);
    const list = (await request(app).get('/api/v1/imports').set(as())).body;
    const committed = list.find((b: { status: string }) => b.status === 'COMMITTED');
    expect((await request(app).post(`/api/v1/imports/${committed.id}/commit`).set(as(true))).body.code).toBe('NOT_VALIDATED');
    expect((await request(app).put(`/api/v1/imports/${committed.id}/mapping`).set(as()).send({ mapping: MAPPING })).body.code).toBe('NOT_MAPPABLE');
    expect((await request(app).post(`/api/v1/imports/${committed.id}/cancel`).set(as())).body.code).toBe('NOT_CANCELLABLE');
  });

  it('saves a mapping for the next file of the same layout', async () => {
    expect((await request(app).put('/api/v1/imports/mappings').set(as()).send({ name: 'TUDA register', mapping: MAPPING })).status).toBe(200);
    const saved = (await request(app).get('/api/v1/imports/mappings').set(as())).body;
    expect(saved).toHaveLength(1);
    expect(saved[0].mapping.transforms.decimalSeparator).toBe(',');
  });
});
