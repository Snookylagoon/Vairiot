import { readFileSync } from 'fs';
import path from 'path';

import pg from 'pg';
import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { capitalisedCostOf, recognitionFor } from '../../services/recognition.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S2.1 (stage 2.3): asset classes with IPSAS policies, recognition against the
// capitalisation threshold, non-exchange acquisitions at fair value, and
// Finance's queue of assets to classify (D20). Gate (test plan §8.3): a sign
// without a life gets 84 months from its class; a GEL 200 item under a GEL 500
// threshold is EXPENSED.

const app = createApp();
const TID = 'test-asset-classes';
const OFF = 'test-asset-classes-off';
let userId = '';
let approverId = '';
let signClassId = '';
let signsCategoryId = '';

const tokenFor = (permissions: string[], tenantId = TID, sub = userId) =>
  signAccessToken({ sub, tenantId, email: 'classes@classes.test', roles: ['Company Admin'], permissions });
const REGISTER = ['asset:read', 'asset:write', 'category:read', 'category:write'];
const preparer = () => tokenFor([...REGISTER, 'accounting:read', 'accounting:write']);
const approver = () => tokenFor([...REGISTER, 'accounting:read', 'accounting:write', 'accounting:approve'], TID, approverId);
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

const SIGNS = {
  code: 'SGN', name: 'Road signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500,
  defaultUsefulLifeMonths: 84, defaultResidualPct: 0, glAssetAccount: '1610',
};
const newAsset = (body: Record<string, unknown>, token = preparer()) =>
  request(app).post('/api/v1/assets').set(as(token)).send(body);

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  await prisma.tenant.upsert({ where: { id: OFF }, update: { onboardingComplete: true, featureFlags: {} }, create: { id: OFF, name: OFF, onboardingComplete: true } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'classes@classes.test' } }, update: {}, create: { tenantId: TID, email: 'classes@classes.test', name: 'Preparer' } })).id;
  approverId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'approver@classes.test' } }, update: {}, create: { tenantId: TID, email: 'approver@classes.test', name: 'Approver' } })).id;
  await prisma.user.upsert({ where: { tenantId_email: { tenantId: OFF, email: 'classes@classes.test' } }, update: {}, create: { id: `${userId}-off`, tenantId: OFF, email: 'classes@classes.test', name: 'Off' } });
  await ensureTestLicence(TID);
  await ensureTestLicence(OFF);
  signsCategoryId = (await prisma.category.create({ data: { tenantId: TID, name: 'Signs' } })).id;
});

afterAll(async () => {
  await flushAuditEvents();
  for (const id of [TID, OFF]) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
    await prisma.disposal.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.category.deleteMany({ where: { tenantId: id } });
    await prisma.assetClass.deleteMany({ where: { tenantId: id } });
    await removeTestLicence(id);
    await prisma.user.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe('recognition rules', () => {
  it('adds cost components, or takes fair value for a donation or transfer', () => {
    expect(capitalisedCostOf('PURCHASE', { purchaseCost: '450.10', freightCost: 30, installationCost: '19.805' }, null)!.toFixed(2)).toBe('499.91');
    expect(capitalisedCostOf('PURCHASE', {}, 900)).toBeNull();
    expect(capitalisedCostOf('DONATION', { purchaseCost: 10 }, '800')!.toFixed(2)).toBe('800.00');
    expect(capitalisedCostOf('TRANSFER_IN', { purchaseCost: 10 }, null)).toBeNull();
  });

  it('recognises at or above the threshold, expenses below, waits without a class or a cost', () => {
    const cls = { capitalisationThreshold: '500.00' };
    const at = (v: string) => recognitionFor(cls, capitalisedCostOf('PURCHASE', { purchaseCost: v }, null)).status;
    expect(at('500.00')).toBe('RECOGNISED');
    expect(at('499.99')).toBe('EXPENSED');
    expect(recognitionFor(null, null)).toEqual({ status: 'PENDING_REVIEW', reason: 'no_class' });
    expect(recognitionFor(cls, null)).toEqual({ status: 'PENDING_REVIEW', reason: 'no_cost' });
  });
});

describe('asset classes', () => {
  it('are created with their policies and listed with their use', async () => {
    const r = await request(app).post('/api/v1/accounting/classes').set(as(preparer())).send(SIGNS);
    expect(r.status).toBe(201);
    signClassId = r.body.id;
    expect(r.body).toMatchObject({ code: 'SGN', defaultDepreciationMethod: 'straight_line', toBeConfirmed: false, active: true });
    const list = await request(app).get('/api/v1/accounting/classes').set(as(preparer()));
    expect(list.body[0]).toMatchObject({ code: 'SGN', assetCount: 0, categoryCount: 0 });
  });

  it('refuse bad input and a duplicate code', async () => {
    const bad = await request(app).post('/api/v1/accounting/classes').set(as(preparer())).send({ ...SIGNS, code: 'sgn x', capitalisationThreshold: -1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/code/);
    expect((await request(app).post('/api/v1/accounting/classes').set(as(preparer())).send(SIGNS)).status).toBe(409);
  });

  it('need accounting:write to change', async () => {
    const reader = tokenFor([...REGISTER, 'accounting:read']);
    expect((await request(app).post('/api/v1/accounting/classes').set(as(reader)).send({ ...SIGNS, code: 'X' })).status).toBe(403);
  });

  it('point a category at the class', async () => {
    const r = await request(app).put(`/api/v1/accounting/categories/${signsCategoryId}/class`).set(as(preparer())).send({ assetClassId: signClassId });
    expect(r.status).toBe(200);
    expect(r.body.assetClassId).toBe(signClassId);
  });
});

describe('recognition on the register', () => {
  let signId = '';
  let cheapId = '';

  it('S2.1 gate: a sign without a life gets 84 months from its class', async () => {
    const r = await newAsset({ name: 'Give way sign', categoryId: signsCategoryId, purchaseCost: 1000 });
    expect(r.status).toBe(201);
    signId = r.body.id;
    expect(r.body).toMatchObject({
      assetClassId: signClassId, usefulLifeMonths: 84, depreciationMethod: 'straight_line',
      acquisitionType: 'PURCHASE', recognitionStatus: 'RECOGNISED',
    });
    expect(r.body.capitalisedCost).toBe('1000');
  });

  it('S2.1 gate: a GEL 200 item under a GEL 500 threshold is EXPENSED, with no carrying amount', async () => {
    const r = await newAsset({ name: 'Bracket', assetClassId: signClassId, purchaseCost: 200, depreciationStartDate: '2026-01-01' });
    cheapId = r.body.id;
    expect(r.body.recognitionStatus).toBe('EXPENSED');
    expect(r.body.depreciation).toMatchObject({ netBookValue: 0, accumulatedDepreciation: 0 });
  });

  it('keeps a life that was sent, and fills the residual from the class', async () => {
    await request(app).patch(`/api/v1/accounting/classes/${signClassId}`).set(as(preparer())).send({ defaultResidualPct: 10 });
    const r = await newAsset({ name: 'Stop sign', assetClassId: signClassId, purchaseCost: 1234.5, usefulLifeMonths: 60 });
    expect(r.body).toMatchObject({ usefulLifeMonths: 60, residualValue: '123.45' });
  });

  it('recognises a donation at fair value and records the donor', async () => {
    const r = await newAsset({
      name: 'Donated shelter', assetClassId: signClassId, acquisitionType: 'DONATION',
      fairValueAtRecognition: 800, sourceEntity: 'Tbilisi City Hall', recognitionDate: '2026-10-01', purchaseCost: 1,
    });
    expect(r.body).toMatchObject({ acquisitionType: 'DONATION', capitalisedCost: '800', sourceEntity: 'Tbilisi City Hall', recognitionStatus: 'RECOGNISED' });
    expect(new Date(r.body.recognitionDate).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('leaves assets without a class or a cost for Finance, with the reason', async () => {
    const noClass = await newAsset({ name: 'Mystery post', purchaseCost: 900 });
    const noCost = await newAsset({ name: 'Uncosted sign', categoryId: signsCategoryId });
    expect(noClass.body.recognitionStatus).toBe('PENDING_REVIEW');
    expect(noCost.body.recognitionStatus).toBe('PENDING_REVIEW');
    const list = await request(app).get('/api/v1/accounting/assets/pending-review').set(as(preparer()));
    const reasons = Object.fromEntries(list.body.map((a: { id: string; reason: string }) => [a.id, a.reason]));
    expect(reasons[noClass.body.id]).toBe('no_class');
    expect(reasons[noCost.body.id]).toBe('no_cost');
    // Costed later: recognised.
    const costed = await request(app).patch(`/api/v1/assets/${noCost.body.id}`).set(as(preparer())).send({ purchaseCost: 700 });
    expect(costed.body.recognitionStatus).toBe('RECOGNISED');
  });

  it('refuses an unknown class and a bad acquisition type', async () => {
    expect((await newAsset({ name: 'X', assetClassId: 'no-such-class' })).status).toBe(400);
    expect((await newAsset({ name: 'X', acquisitionType: 'GIFT' })).status).toBe(400);
  });

  it('applies a new threshold to the class at once', async () => {
    await request(app).patch(`/api/v1/accounting/classes/${signClassId}`).set(as(preparer())).send({ capitalisationThreshold: 1500 });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: signId } })).recognitionStatus).toBe('EXPENSED');
    await request(app).patch(`/api/v1/accounting/classes/${signClassId}`).set(as(preparer())).send({ capitalisationThreshold: 500 });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: signId } })).recognitionStatus).toBe('RECOGNISED');
  });

  it('lets an approver override the rule with a reason, which then holds until cleared', async () => {
    const url = `/api/v1/accounting/assets/${cheapId}/recognition`;
    expect((await request(app).put(url).set(as(preparer())).send({ status: 'RECOGNISED', reason: 'Part of a network' })).status).toBe(403);
    expect((await request(app).put(url).set(as(approver())).send({ status: 'RECOGNISED' })).status).toBe(400);
    const set = await request(app).put(url).set(as(approver())).send({ status: 'RECOGNISED', reason: 'Part of a signal network' });
    expect(set.body).toMatchObject({ recognitionStatus: 'RECOGNISED', recognitionOverride: true });
    const edited = await request(app).patch(`/api/v1/assets/${cheapId}`).set(as(preparer())).send({ purchaseCost: 150 });
    expect(edited.body.recognitionStatus).toBe('RECOGNISED');
    const cleared = await request(app).put(url).set(as(approver())).send({ status: null });
    expect(cleared.body).toMatchObject({ recognitionStatus: 'EXPENSED', recognitionOverride: false, recognitionOverrideReason: null });
    await flushAuditEvents();
    const actions = (await prisma.auditEvent.findMany({ where: { tenantId: TID, entityId: cheapId } })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['recognition_overridden', 'recognition_override_cleared']));
  });

  it('writes DISPOSED on the ledger when an asset is disposed', async () => {
    const r = await request(app).post(`/api/v1/assets/${signId}/dispose`).set(as(preparer()))
      .send({ disposalDate: '2026-10-16', disposalMethod: 'scrapped', disposalValue: 0 });
    expect(r.status).toBe(200);
    const event = await prisma.assetEvent.findFirst({ where: { assetId: signId, eventType: 'DISPOSED' } });
    expect(event?.payload).toMatchObject({ method: 'scrapped' });
  });
});

describe('with ipsas off', () => {
  it('ignores accounting fields and leaves recognition alone', async () => {
    const r = await newAsset({ name: 'Plain asset', purchaseCost: 50, acquisitionType: 'GIFT', assetClassId: signClassId },
      tokenFor(REGISTER, OFF, `${userId}-off`));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ assetClassId: null, recognitionStatus: null, capitalisedCost: null, acquisitionType: 'PURCHASE' });
  });
});

describe('migration back-fill (D20)', () => {
  it('costs existing assets and marks those of ipsas tenants for review', async () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../prisma/migrations/20261016080000_asset_classes/migration.sql'), 'utf8');
    const backfill = sql.slice(sql.indexOf('-- Back-fill'));
    const on = await prisma.asset.create({ data: { tenantId: TID, assetNumber: 'BF-1', name: 'Old sign', purchaseCost: 300, freightCost: 20 } });
    const off = await prisma.asset.create({ data: { tenantId: OFF, assetNumber: 'BF-2', name: 'Old desk', purchaseCost: 90 } });
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try { await client.query(backfill); } finally { await client.end(); }
    const [a, b] = await Promise.all([prisma.asset.findUniqueOrThrow({ where: { id: on.id } }), prisma.asset.findUniqueOrThrow({ where: { id: off.id } })]);
    expect(a).toMatchObject({ recognitionStatus: 'PENDING_REVIEW' });
    expect(a.capitalisedCost!.toFixed(2)).toBe('320.00');
    expect(b.recognitionStatus).toBeNull();
    expect(b.capitalisedCost!.toFixed(2)).toBe('90.00');
  });
});
