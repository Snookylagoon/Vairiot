import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { isUnlimitedCap } from '../../services/asset-cap.service';
import { stagedImport } from '../helpers/staged-import';

// KFR-038: Enterprise (maxAssets = -1) was refused every asset, because the
// check was `count >= maxAssets`. KFR-039: the bulk import skipped the cap.

const app = createApp();
const TID = 'test-asset-cap';
let token = '';
let licenceId = '';

async function useTier(name: 'TIER_2' | 'TIER_3', maxAssets: number): Promise<() => Promise<void>> {
  const tier = await prisma.licenceTier.upsert({
    where: { name },
    update: {},
    create: { name, displayName: name, maxAssets, pricePerYear: 0 },
  });
  await prisma.licenceTier.update({ where: { id: tier.id }, data: { maxAssets } });
  await prisma.licence.update({ where: { id: licenceId }, data: { tierId: tier.id } });
  return async () => { await prisma.licenceTier.update({ where: { id: tier.id }, data: { maxAssets: tier.maxAssets } }); };
}

const countAssets = () => prisma.asset.count({ where: { tenantId: TID, deletedAt: null } });
const create = (name: string) =>
  request(app).post('/api/v1/assets').set('Authorization', `Bearer ${token}`).send({ name });
const importRows = (rows: Array<Record<string, string>>) => stagedImport(app, `Bearer ${token}`, TID, rows);

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: { onboardingComplete: true },
    create: { id: TID, name: 'Asset cap test', onboardingComplete: true },
  });
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'cap@cap.test' } },
    update: {}, create: { tenantId: TID, email: 'cap@cap.test', name: 'Cap tester' },
  });
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'TIER_2' }, update: {},
    create: { name: 'TIER_2', displayName: 'Professional', maxAssets: 1500, pricePerYear: 50 },
  });
  licenceId = (await prisma.licence.create({
    data: {
      tenantId: TID, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true,
      licenceNumber: `VAI-CAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  })).id;
  token = signAccessToken({
    sub: user.id, tenantId: TID, email: user.email, roles: ['Asset Manager'],
    permissions: ['asset:read', 'asset:write'],
  });
});

afterEach(async () => {
  await prisma.assetEvent.deleteMany({ where: { tenantId: TID } }).catch(() => {});
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.importBatch.deleteMany({ where: { tenantId: TID } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Unlimited tier (maxAssets = -1)', () => {
  it('treats any negative cap as unlimited', () => {
    expect(isUnlimitedCap(-1)).toBe(true);
    expect(isUnlimitedCap(0)).toBe(false);
    expect(isUnlimitedCap(500)).toBe(false);
  });

  it('lets an Enterprise tenant create assets one by one and by import', async () => {
    const restore = await useTier('TIER_3', -1);
    try {
      expect((await create('Enterprise asset')).status).toBe(201);
      const res = await importRows([{ name: 'E1' }, { name: 'E2' }, { name: 'E3' }]);
      expect(res).toMatchObject({ status: 'COMMITTED', created: 3 });
    } finally { await restore(); }
  });
});

describe('Capped tier', () => {
  it('still refuses a single create at the cap', async () => {
    const restore = await useTier('TIER_2', 1);
    try {
      expect((await create('First')).status).toBe(201);
      const res = await create('Second');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ASSET_CAP_REACHED');
    } finally { await restore(); }
  });

  it('refuses an import that would pass the cap, and creates nothing', async () => {
    const restore = await useTier('TIER_2', 3);
    try {
      expect((await create('Existing')).status).toBe(201);
      const res = await importRows([{ name: 'I1' }, { name: 'I2' }, { name: 'I3' }]);
      expect(res).toMatchObject({ status: 'FAILED', created: 0 });
      expect(res.jobError).toMatch(/^Adding 3 assets would exceed the limit/);
      expect(await countAssets()).toBe(1);
    } finally { await restore(); }
  });

  it('accepts an import that fits, ignoring nameless rows in the count', async () => {
    const restore = await useTier('TIER_2', 3);
    try {
      const res = await importRows([{ name: 'A' }, { name: '', notes: 'no name' }, { name: 'B' }, { name: 'C' }]);
      expect(res).toMatchObject({ status: 'COMMITTED', created: 3, errors: [{ row: 3, message: 'Name is required' }] });
    } finally { await restore(); }
  });
});
