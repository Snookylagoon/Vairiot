import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
const app = createApp();
const TID = 'test-tenant-001';
const EMAIL = 'test@vairiot.test';
const PASS = 'TestPassword123!';
beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: {}, create: { id: TID, name: 'Test Tenant', slug: 'test-tenant' } });
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: {}, create: { tenantId: TID, name: 'Administrator', permissions: ['asset:read'] } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Test User', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
});
afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});
describe('GET /health', () => {
  it('returns ok', async () => { expect((await request(app).get('/health')).status).toBe(200); });
  it('returns ready', async () => { const r = await request(app).get('/health/ready'); expect(r.status).toBe(200); expect(r.body.database).toBe('connected'); });
});
describe('POST /api/v1/auth/login', () => {
  it('returns tokens', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
    expect(r.status).toBe(200); expect(r.body).toHaveProperty('accessToken');
  });
  it('rejects wrong password', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'wrong', tenantId: TID })).status).toBe(401);
  });
  it('rejects bad input', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'bad' })).status).toBe(400);
  });
});
describe('GET /api/v1/auth/me', () => {
  let token: string;
  beforeAll(async () => { token = (await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID })).body.accessToken; });
  it('returns profile', async () => {
    const r = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200); expect(r.body.email).toBe(EMAIL);
  });
  it('rejects no token', async () => { expect((await request(app).get('/api/v1/auth/me')).status).toBe(401); });
});
