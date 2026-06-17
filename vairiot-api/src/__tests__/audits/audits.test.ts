import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID = 'test-audit-tenant-001';
const EMAIL = 'audittest@vairiot.test';
const PASS = 'TestPassword123x';
let token: string;
let assetId: string;
let campaignId: string;

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: {}, create: { id: TID, name: 'Audit Test Tenant', slug: 'audit-test-tenant' } });
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: {}, create: { tenantId: TID, name: 'Administrator', permissions: ['asset:read'] } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Audit Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
  const asset = await prisma.asset.create({ data: { tenantId: TID, assetNumber: 'AST-TEST-001', name: 'Test Laptop', rfidTag: 'RFID-TEST-001', status: 'active' } });
  assetId = asset.id;
});

afterAll(async () => {
  await prisma.auditScanEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.checkout.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Audit Campaigns', () => {
  it('creates a campaign', async () => {
    const r = await request(app).post('/api/v1/audits').set('Authorization', `Bearer ${token}`).send({ name: 'Q2 2026 Audit' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('draft');
    campaignId = r.body.id;
  });
  it('lists campaigns', async () => {
    const r = await request(app).get('/api/v1/audits').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
  it('starts a campaign', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/start`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('in_progress');
  });
  it('records a scan — known tag', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set('Authorization', `Bearer ${token}`).send({ tagValue: 'RFID-TEST-001' });
    expect(r.status).toBe(201);
    expect(r.body.result).toBe('found');
  });
  it('records a scan — unknown tag', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/scans`).set('Authorization', `Bearer ${token}`).send({ tagValue: 'RFID-UNKNOWN-999' });
    expect(r.status).toBe(201);
    expect(r.body.result).toBe('unknown');
  });
  it('completes campaign and returns report', async () => {
    const r = await request(app).post(`/api/v1/audits/${campaignId}/complete`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('totalScanned');
    expect(r.body.totalScanned).toBe(2);
  });
});

describe('Check-in / Check-out', () => {
  it('checks out an asset', async () => {
    const r = await request(app).post('/api/v1/checkouts').set('Authorization', `Bearer ${token}`).send({ assetId, custodianId: 'user-001' });
    expect(r.status).toBe(201);
    expect(r.body.checkedInAt).toBeNull();
  });
  it('rejects double checkout', async () => {
    const r = await request(app).post('/api/v1/checkouts').set('Authorization', `Bearer ${token}`).send({ assetId, custodianId: 'user-002' });
    expect(r.status).toBe(409);
  });
  it('lists active checkouts', async () => {
    const r = await request(app).get('/api/v1/checkouts').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
  it('checks in an asset', async () => {
    const r = await request(app).post(`/api/v1/checkouts/${assetId}/checkin`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.checkedInAt).not.toBeNull();
  });
  it('returns checkout history', async () => {
    const r = await request(app).get(`/api/v1/checkouts/${assetId}/history`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
});
