import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID   = 'test-tenant-photos';
const EMAIL = 'photo@vairiot.test';
const PASS  = 'PhotoTesterPwd123!';

let token   = '';
let assetId = '';
let photoId = '';

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: {},
    create: { id: TID, name: 'Photos Test Tenant', slug: 'test-photos' },
  });
  const PERMS = ['asset:read', 'asset:write', 'asset:delete'];
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Administrator' } },
    update: { permissions: PERMS },
    create: { tenantId: TID, name: 'Administrator', permissions: PERMS },
  });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: EMAIL } },
    update: {},
    create: { tenantId: TID, email: EMAIL, name: 'Photo Tester', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {}, create: { userId: user.id, roleId: role.id },
  });

  token = (await request(app).post('/api/v1/auth/login')
    .send({ email: EMAIL, password: PASS, tenantId: TID })).body.accessToken;

  const asset = await prisma.asset.create({
    data: { tenantId: TID, assetNumber: 'AST-PHOTO-001', name: 'Photo subject' },
  });
  assetId = asset.id;

  // Insert a Photo row directly — we don't have MinIO in CI and PATCH/list/delete don't touch object storage.
  const photo = await prisma.photo.create({
    data: {
      tenantId:   TID,
      assetId,
      storageKey: `${TID}/${assetId}/seed.jpg`,
      mimeType:   'image/jpeg',
      sizeBytes:  1024,
      createdBy:  user.id,
    },
  });
  photoId = photo.id;
});

afterAll(async () => {
  await prisma.photo.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('GET /api/v1/assets/:assetId/photos', () => {
  it('lists photos for the asset', async () => {
    const r = await request(app).get(`/api/v1/assets/${assetId}/photos`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(1);
    expect(r.body[0]).toHaveProperty('caption');
  });
});

describe('PATCH /api/v1/photos/:id', () => {
  it('updates the caption', async () => {
    const r = await request(app).patch(`/api/v1/photos/${photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ caption: 'A test caption' });
    expect(r.status).toBe(200);
    expect(r.body.caption).toBe('A test caption');
  });

  it('clears the caption when set to null', async () => {
    const r = await request(app).patch(`/api/v1/photos/${photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ caption: null });
    expect(r.status).toBe(200);
    expect(r.body.caption).toBeNull();
  });

  it('rejects a caption over 500 chars', async () => {
    const r = await request(app).patch(`/api/v1/photos/${photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ caption: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('404s on unknown photo', async () => {
    const r = await request(app).patch('/api/v1/photos/no-such-photo')
      .set('Authorization', `Bearer ${token}`)
      .send({ caption: 'X' });
    expect(r.status).toBe(404);
  });
});
