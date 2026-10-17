import { readFileSync } from 'fs';
import path from 'path';

import pg from 'pg';
import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Stage 2.7: the person or unit accountable for an asset — set on the asset,
// changed by a transfer, recorded on the ledger, and inherited and followed
// by components (S2.2).

const app = createApp();
const TID = 'test-custodian';
let userId = '';

const token = () => signAccessToken({
  sub: userId, tenantId: TID, email: 'cust@cust.test', roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', 'accounting:read', 'accounting:write'],
});
const as = () => ({ Authorization: `Bearer ${token()}` });
const create = (body: Record<string, unknown>) => request(app).post('/api/v1/assets').set(as()).send(body);
const custodianEvents = (assetId: string) =>
  prisma.assetEvent.findMany({ where: { assetId, eventType: 'CUSTODIAN_CHANGED' }, orderBy: { seq: 'asc' } }).then((es) => es.map((e) => e.payload));

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'cust@cust.test' } }, update: {}, create: { tenantId: TID, email: 'cust@cust.test', name: 'Custodian tester' } })).id;
  await ensureTestLicence(TID);
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.transfer.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.updateMany({ where: { tenantId: TID }, data: { parentAssetId: null, componentRole: null } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('on the asset', () => {
  it('is set, changed and cleared, each change on the ledger', async () => {
    const r = await create({ name: 'Signal cabinet', custodian: '  Traffic Department  ' });
    expect(r.body.custodian).toBe('Traffic Department');
    await request(app).patch(`/api/v1/assets/${r.body.id}`).set(as()).send({ custodian: 'Road Maintenance Unit' });
    const cleared = await request(app).patch(`/api/v1/assets/${r.body.id}`).set(as()).send({ custodian: '' });
    expect(cleared.body.custodian).toBeNull();
    expect(await custodianEvents(r.body.id)).toEqual([
      { from: null, to: 'Traffic Department' },
      { from: 'Traffic Department', to: 'Road Maintenance Unit' },
      { from: 'Road Maintenance Unit', to: null },
    ]);
  });

  it('is at most 120 characters', async () => {
    expect((await create({ name: 'X', custodian: 'x'.repeat(121) })).status).toBe(400);
  });

  it('is changed by a transfer that names one', async () => {
    const a = await create({ name: 'Bus shelter', custodian: 'District 1' });
    const t = await request(app).post('/api/v1/transfers').set(as()).send({ assetId: a.body.id, toCustodian: 'District 2', reason: 'Re-zoned' });
    expect(t.body).toMatchObject({ fromCustodian: 'District 1', toCustodian: 'District 2' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.body.id } })).custodian).toBe('District 2');
    expect((await custodianEvents(a.body.id)).at(-1)).toEqual({ from: 'District 1', to: 'District 2' });
  });
});

describe('components', () => {
  it('take the parent’s custodian and follow it while they still share it', async () => {
    const parent = await create({ name: 'Junction', custodian: 'Signals Unit' });
    const part = await create({ name: 'Controller', parentAssetId: parent.body.id, componentRole: 'controller' });
    const own = await create({ name: 'Detector', parentAssetId: parent.body.id, componentRole: 'detector', custodian: 'Contractor' });
    expect(part.body.custodian).toBe('Signals Unit');
    await request(app).patch(`/api/v1/assets/${parent.body.id}`).set(as()).send({ custodian: 'Signals Unit East' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: part.body.id } })).custodian).toBe('Signals Unit East');
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: own.body.id } })).custodian).toBe('Contractor');
    expect((await custodianEvents(part.body.id)).at(-1)).toEqual({ from: 'Signals Unit', to: 'Signals Unit East' });
    await request(app).post('/api/v1/transfers').set(as()).send({ assetId: parent.body.id, toCustodian: 'Signals Unit West' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: part.body.id } })).custodian).toBe('Signals Unit West');
  });
});

describe('import and export', () => {
  it('reads and writes the Custodian column', async () => {
    const r = await request(app).post('/api/v1/assets/import').set(as()).send({ rows: [{ name: 'Imported bench', custodian: 'Parks' }] });
    expect(r.body.created).toBe(1);
    const csv = await request(app).get('/api/v1/assets/export.csv').set(as());
    expect(csv.text.split('\n')[0]).toContain('Location,Custodian,');
    expect(csv.text).toMatch(/Imported bench,.*,Parks,/);
  });
});

describe('migration back-fill', () => {
  it('takes the custodian of the latest transfer that named one', async () => {
    const a = await prisma.asset.create({ data: { tenantId: TID, assetNumber: 'CUST-BF', name: 'Old sign' } });
    const t = (n: number, toCustodian: string | null) =>
      prisma.transfer.create({ data: { tenantId: TID, assetId: a.id, toCustodian, createdBy: userId, transferDate: new Date(2026, 0, n) } });
    await t(1, 'First holder');
    await t(2, 'Latest holder');
    await t(3, null);
    const sql = readFileSync(path.resolve(__dirname, '../../../prisma/migrations/20261017010000_asset_custodian/migration.sql'), 'utf8');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try { await client.query(sql.slice(sql.indexOf('UPDATE "assets"'))); } finally { await client.end(); }
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).custodian).toBe('Latest holder');
  });
});
