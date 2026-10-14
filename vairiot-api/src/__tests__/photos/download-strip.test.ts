import { Readable } from 'stream';

import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';

import { SECRET, jpegWithMetadata } from './image-fixtures';

// KFR-043 end to end: the original keeps its metadata in storage, and every
// copy that leaves the API (photo download, image document download, company
// logo) has it removed. The test stack has no MinIO, so an in-memory store
// stands in for it.

const store = new Map<string, Buffer>();
jest.mock('../../lib/minio', () => ({
  PHOTO_BUCKET: 'photos',
  DOCUMENT_BUCKET: 'documents',
  MOBILE_RELEASES_BUCKET: 'releases',
  minioClient: {
    putObject: async (bucket: string, key: string, body: Buffer) => { store.set(`${bucket}/${key}`, Buffer.from(body)); },
    getObject: async (bucket: string, key: string) => {
      const body = store.get(`${bucket}/${key}`);
      if (!body) throw new Error('NoSuchKey');
      return Readable.from([body]);
    },
    removeObject: async (bucket: string, key: string) => { store.delete(`${bucket}/${key}`); },
  },
}));

const app = createApp();
const TID = 'test-download-strip';
let token = '';
let assetId = '';
const has = (buf: Buffer, text: string) => buf.includes(Buffer.from(text, 'latin1'));
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: { onboardingComplete: true },
    create: { id: TID, name: 'Download strip test', onboardingComplete: true },
  });
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'strip@strip.test' } },
    update: {}, create: { tenantId: TID, email: 'strip@strip.test', name: 'Strip tester' },
  });
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0, isPerpetual: true },
  });
  await prisma.licence.create({
    data: {
      tenantId: TID, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true,
      licenceNumber: `VAI-STRIP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  token = signAccessToken({
    sub: user.id, tenantId: TID, email: user.email, roles: ['Asset Manager'],
    permissions: ['asset:read', 'asset:write', 'asset:delete'],
  });
  assetId = (await request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Photographed asset' })).body.id;
});

afterAll(async () => {
  await prisma.photo.deleteMany({ where: { tenantId: TID } });
  await prisma.document.deleteMany({ where: { tenantId: TID } });
  await prisma.assetEvent.deleteMany({ where: { tenantId: TID } }).catch(() => {});
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

it('serves a photo without its EXIF/GPS while the stored original keeps it', async () => {
  const up = await request(app).post(`/api/v1/assets/${assetId}/photos`)
    .set('Authorization', `Bearer ${token}`)
    .attach('photo', jpegWithMetadata(6), { filename: 'site.jpg', contentType: 'image/jpeg' });
  expect(up.status).toBe(201);

  const stored = [...store.entries()].find(([k]) => k.startsWith(`photos/${TID}/`))![1];
  expect(has(stored, SECRET)).toBe(true);

  const res = await request(app).get(`/api/v1/photos/${up.body.id}/download`)
    .set('Authorization', `Bearer ${token}`).buffer(true).parse(binary);
  expect(res.status).toBe(200);
  expect(has(res.body, SECRET)).toBe(false);
  expect(has(res.body, 'KEEP-ICC')).toBe(true);
});

it('strips an image uploaded as a document', async () => {
  const up = await request(app).post(`/api/v1/assets/${assetId}/documents`)
    .set('Authorization', `Bearer ${token}`)
    .field('documentType', 'other')
    .attach('document', jpegWithMetadata(1), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
  expect(up.status).toBe(201);

  const res = await request(app).get(`/api/v1/documents/${up.body.id}/download`)
    .set('Authorization', `Bearer ${token}`).buffer(true).parse(binary);
  expect(res.status).toBe(200);
  expect(has(res.body, SECRET)).toBe(false);
});

it('strips the public company logo', async () => {
  store.set('photos/logos/strip.jpg', jpegWithMetadata(1));
  await prisma.company.upsert({
    where: { tenantId: TID },
    update: { logoStorageKey: 'logos/strip.jpg' },
    create: {
      tenantId: TID, legalName: 'Strip Ltd', addressLine1: '1 Road', city: 'London', country: 'GB',
      primaryContactName: 'S', primaryContactEmail: 's@strip.test', logoStorageKey: 'logos/strip.jpg',
    },
  });
  const res = await request(app).get(`/api/v1/public/tenants/${TID}/logo`).buffer(true).parse(binary);
  expect(res.status).toBe(200);
  expect(has(res.body, SECRET)).toBe(false);
  await prisma.company.delete({ where: { tenantId: TID } });
});
