import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID = 'test-scan-session-tenant-001';
const EMAIL = 'scansessiontest@vairiot.test';
const PASS = 'TestPassword123x';
let token: string;
let assetId: string;

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'Scan Session Test Tenant', onboardingComplete: true } });
  const PERMS = ['asset:read', 'asset:write', 'scan:execute'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: PERMS }, create: { tenantId: TID, name: 'Administrator', permissions: PERMS } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Scan Session Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
  const asset = await prisma.asset.create({ data: { tenantId: TID, assetNumber: 'AST-SCAN-001', name: 'Test Pallet', rfidTag: 'EPC-KNOWN-001', status: 'active' } });
  assetId = asset.id;
});

afterAll(async () => {
  await prisma.scanSessionTag.deleteMany({ where: { session: { tenantId: TID } } });
  await prisma.scanSession.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

function payload(sessionId: string) {
  return {
    sessionId,
    siteId: null,
    categoryId: null,
    createdAtMs: 1783745000000,
    completedAtMs: 1783745180000,
    tags: [
      { epc: 'EPC-KNOWN-001', status: 'KNOWN', readCount: 2, firstSeenMs: 1783745000100, lastSeenMs: 1783745179000, assetId },
      { epc: 'EPC-NEW-001', status: 'NEW', readCount: 3, firstSeenMs: 1783745010000, lastSeenMs: 1783745020000, assetId: null },
    ],
  };
}

describe('Scan session upload', () => {
  it('rejects unauthenticated requests', async () => {
    const r = await request(app).post('/api/v1/scan-sessions').send(payload('sess-noauth'));
    expect(r.status).toBe(401);
  });

  it('uploads a session and its tags', async () => {
    const r = await request(app).post('/api/v1/scan-sessions').set('Authorization', `Bearer ${token}`).send(payload('sess-001'));
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('sess-001');
    expect(typeof r.body.uploadedAt).toBe('string');

    const tags = await prisma.scanSessionTag.findMany({ where: { sessionId: 'sess-001' } });
    expect(tags).toHaveLength(2);
    expect(tags.find(t => t.epc === 'EPC-KNOWN-001')?.assetId).toBe(assetId);
  });

  it('re-uploading the same sessionId upserts instead of erroring or duplicating', async () => {
    const body = payload('sess-001');
    body.tags = [body.tags[0]];
    const r = await request(app).post('/api/v1/scan-sessions').set('Authorization', `Bearer ${token}`).send(body);
    expect(r.status).toBe(201);

    const tags = await prisma.scanSessionTag.findMany({ where: { sessionId: 'sess-001' } });
    expect(tags).toHaveLength(1);
  });

  it('rejects a malformed payload', async () => {
    const r = await request(app).post('/api/v1/scan-sessions').set('Authorization', `Bearer ${token}`).send({ sessionId: 'sess-bad' });
    expect(r.status).toBe(400);
  });
});
