import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID = 'test-asset-tenant-001';
const EMAIL = 'assettest@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let categoryId: string;
let siteId: string;
let assetId: string;

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: {}, create: { id: TID, name: 'Asset Test Tenant', slug: 'asset-test-tenant' } });
  const ADMIN_PERMS = ['asset:read', 'asset:write', 'asset:delete', 'site:write', 'category:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: ADMIN_PERMS }, create: { tenantId: TID, name: 'Administrator', permissions: ADMIN_PERMS } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Asset Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.category.deleteMany({ where: { tenantId: TID } });
  await prisma.location.deleteMany({ where: { site: { tenantId: TID } } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Categories', () => {
  it('creates a category', async () => {
    const r = await request(app).post('/api/v1/categories').set('Authorization', `Bearer ${token}`).send({ name: 'IT Equipment' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('IT Equipment');
    categoryId = r.body.id;
  });
  it('lists categories', async () => {
    const r = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

describe('Sites', () => {
  it('creates a site', async () => {
    const r = await request(app).post('/api/v1/sites').set('Authorization', `Bearer ${token}`).send({ name: 'Head Office', city: 'London', country: 'UK' });
    expect(r.status).toBe(201);
    siteId = r.body.id;
  });
  it('creates a location within a site', async () => {
    const r = await request(app).post(`/api/v1/sites/${siteId}/locations`).set('Authorization', `Bearer ${token}`).send({ name: 'Server Room', type: 'room' });
    expect(r.status).toBe(201);
  });
});

describe('Assets', () => {
  it('creates an asset', async () => {
    const r = await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dell Laptop XPS 15', categoryId, siteId, serialNumber: 'SN-123456', barcode: 'BC-001' });
    expect(r.status).toBe(201);
    expect(r.body.assetNumber).toMatch(/^AST-/);
    assetId = r.body.id;
  });
  it('lists assets', async () => {
    const r = await request(app).get('/api/v1/assets').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(0);
  });
  it('gets asset by id', async () => {
    const r = await request(app).get(`/api/v1/assets/${assetId}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Dell Laptop XPS 15');
  });
  it('searches assets by name', async () => {
    const r = await request(app).get('/api/v1/assets?search=Dell').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.length).toBeGreaterThan(0);
  });
  it('finds asset by barcode tag', async () => {
    const r = await request(app).get('/api/v1/assets/tag/BC-001').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(assetId);
  });
  it('updates an asset', async () => {
    const r = await request(app).patch(`/api/v1/assets/${assetId}`).set('Authorization', `Bearer ${token}`).send({ condition: 'excellent' });
    expect(r.status).toBe(200);
    expect(r.body.condition).toBe('excellent');
  });
  it('returns 404 for unknown asset', async () => {
    const r = await request(app).get('/api/v1/assets/nonexistent-id').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(404);
  });
  it('deletes an asset', async () => {
    const r = await request(app).delete(`/api/v1/assets/${assetId}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);
  });
});
