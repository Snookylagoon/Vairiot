import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID = 'test-tenant-users';
const ADMIN_EMAIL = 'admin@users-test.vairiot.test';
const NOAUTH_EMAIL = 'reader@users-test.vairiot.test';
const PASS = 'TestPassword123!';

let adminToken = '';
let readerToken = '';
let memberRoleId = '';
let inviteeId = '';

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: {},
    create: { id: TID, name: 'Users Test Tenant', slug: 'test-users' },
  });

  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Administrator' } },
    update: { permissions: ['user:read', 'user:write'] },
    create: { tenantId: TID, name: 'Administrator', permissions: ['user:read', 'user:write'] },
  });
  const memberRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Member' } },
    update: { permissions: ['asset:read'] },
    create: { tenantId: TID, name: 'Member', permissions: ['asset:read'] },
  });
  memberRoleId = memberRole.id;

  const hash = await bcrypt.hash(PASS, 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: ADMIN_EMAIL } },
    update: {},
    create: { tenantId: TID, email: ADMIN_EMAIL, name: 'Admin', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {}, create: { userId: admin.id, roleId: adminRole.id },
  });

  const reader = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: NOAUTH_EMAIL } },
    update: {},
    create: { tenantId: TID, email: NOAUTH_EMAIL, name: 'Reader', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: reader.id, roleId: memberRole.id } },
    update: {}, create: { userId: reader.id, roleId: memberRole.id },
  });

  adminToken = (await request(app).post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: PASS, tenantId: TID })).body.accessToken;
  readerToken = (await request(app).post('/api/v1/auth/login')
    .send({ email: NOAUTH_EMAIL, password: PASS, tenantId: TID })).body.accessToken;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('GET /api/v1/users', () => {
  it('lists users for an admin', async () => {
    const r = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects users without user:read', async () => {
    const r = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${readerToken}`);
    expect(r.status).toBe(403);
  });

  it('rejects unauthenticated', async () => {
    expect((await request(app).get('/api/v1/users')).status).toBe(401);
  });
});

describe('GET /api/v1/users/roles', () => {
  it('returns roles for the tenant', async () => {
    const r = await request(app).get('/api/v1/users/roles').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.map((x: { name: string }) => x.name)).toEqual(
      expect.arrayContaining(['Administrator', 'Member']),
    );
  });
});

describe('POST /api/v1/users', () => {
  it('rejects invalid payload', async () => {
    const r = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email', name: '', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('creates a user', async () => {
    const r = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'invitee@users-test.vairiot.test',
        name: 'Invitee',
        password: 'InviteePassword123!',
        roleId: memberRoleId,
      });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('invitee@users-test.vairiot.test');
    inviteeId = r.body.id;
  });

  it('returns 409 on duplicate email', async () => {
    const r = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'invitee@users-test.vairiot.test',
        name: 'Dup',
        password: 'InviteePassword123!',
      });
    expect(r.status).toBe(409);
  });

  it('rejects non-admin', async () => {
    const r = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ email: 'x@x.test', name: 'x', password: 'Password123!' });
    expect(r.status).toBe(403);
  });
});

describe('PATCH /api/v1/users/:id/active', () => {
  it('toggles active flag', async () => {
    const r = await request(app).patch(`/api/v1/users/${inviteeId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(r.status).toBe(200);
    expect(r.body.active).toBe(false);
  });

  it('404 on unknown user', async () => {
    const r = await request(app).patch('/api/v1/users/does-not-exist/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: true });
    expect(r.status).toBe(404);
  });
});

describe('PATCH /api/v1/users/:id/role', () => {
  it('changes role', async () => {
    const r = await request(app).patch(`/api/v1/users/${inviteeId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: memberRoleId });
    expect(r.status).toBe(200);
  });

  it('404 on unknown role', async () => {
    const r = await request(app).patch(`/api/v1/users/${inviteeId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: 'no-such-role' });
    expect(r.status).toBe(404);
  });
});

describe('GET /api/v1/audit-events', () => {
  it('returns recent events (admin actions wrote some)', async () => {
    const r = await request(app).get('/api/v1/audit-events')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('rejects users without admin scopes', async () => {
    const r = await request(app).get('/api/v1/audit-events')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(r.status).toBe(403);
  });
});
