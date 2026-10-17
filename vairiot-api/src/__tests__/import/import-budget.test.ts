import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import request from 'supertest';
import { ImportRefused, processRegisterImport, type ImportDeps } from 'vairiot-worker/import/register-import';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import * as cap from '../../services/asset-cap.service';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.5 (stage 2.13): the import budget, opt-in (IMPORT_BUDGET=1): 10,000
// rows from upload to commit in under 2 minutes (test plan §3.6). Otherwise
// skipped, as it takes a minute or more. The flow test is staged-import.test.ts.
//
// The staged register import. Each step answers 202 and is
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
const TID = 'test-import-budget';
let userId = '';

const tokenFor = (accounting = false) => signAccessToken({
  sub: userId, tenantId: TID, email: 'budget@import.test', roles: ['Company Admin'],
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
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'budget@import.test' } }, update: {}, create: { tenantId: TID, email: 'budget@import.test', name: 'Importer' } })).id;
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

const ROWS = Number(process.env.IMPORT_BUDGET_ROWS ?? 10_000);
const run = process.env.IMPORT_BUDGET === '1' ? it : it.skip;

run(`imports ${ROWS} rows from upload to commit within the budget`, async () => {
  const rows = Array.from({ length: ROWS }, (_, i) => [`INV-${i}`, `Sign ${i}`, 'SGN', 'Depot', '1 000,00', '10.08.2026', `F-${i}`, `S-${i}`, '', '', 4]);
  const file = await xlsx([HEADERS, ...rows]);
  const spy = jest.spyOn(cap, 'enforceAssetCap').mockResolvedValue(undefined as never); // the test tier allows 500
  const started = Date.now();
  const id = (await request(app).post('/api/v1/imports').set(as()).attach('file', file, 'budget.xlsx')).body.id;
  await work(id, 'parse');
  const parsed = Date.now();
  await request(app).put(`/api/v1/imports/${id}/mapping`).set(as()).send({ mapping: MAPPING });
  await work(id, 'validate');
  const validated = Date.now();
  await request(app).post(`/api/v1/imports/${id}/commit`).set(as());
  await work(id, 'commit');
  const done = Date.now();
  spy.mockRestore();
  console.warn(`import budget: ${ROWS} rows — parse ${parsed - started} ms, validate ${validated - parsed} ms, commit ${done - validated} ms, total ${done - started} ms`);
  expect(await batch(id)).toMatchObject({ status: 'COMMITTED', committedCount: ROWS });
  expect(done - started).toBeLessThan(120_000);
}, 600_000);
