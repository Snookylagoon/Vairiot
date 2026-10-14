import request from 'supertest';

import { createApp } from '../../app';
import { encryptSecret } from '../../lib/crypto';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

// KFR-041: alerts, exceptions, onboarding and two-factor had no guard beyond
// "signed in". Any user (a Viewer, a client account) could rewrite the company,
// pick a licence tier or finish onboarding, and a stolen token alone could
// switch two-factor authentication off.

const app = createApp();
const TID = 'test-route-guards';
let userId = '';

const tokenWith = (roles: string[], permissions: string[]) =>
  signAccessToken({ sub: userId, tenantId: TID, email: 'guard@guard.test', roles, permissions });
const noAccess = () => tokenWith(['Viewer'], ['site:read']);
const viewer = () => tokenWith(['Viewer'], ['asset:read']);
const admin = () => tokenWith(['Company Admin'], ['asset:read', 'company:manage']);
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: { onboardingComplete: true },
    create: { id: TID, name: 'Route guards test', onboardingComplete: true },
  });
  userId = (await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'guard@guard.test' } },
    update: {}, create: { tenantId: TID, email: 'guard@guard.test', name: 'Guard tester' },
  })).id;
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0, isPerpetual: true },
  });
  await prisma.licence.create({
    data: {
      tenantId: TID, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true,
      licenceNumber: `VAI-GUARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
});

afterAll(async () => {
  // Onboarding and two-factor changes write audit events without awaiting them,
  // so one can land after the deleteMany below and block the tenant delete.
  await flushAuditEvents(); // let in-flight audit writes land before deleting the tenant
  await prisma.alertSubscription.deleteMany({ where: { tenantId: TID } });
  await prisma.userTwoFactor.deleteMany({ where: { userId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.onboardingProgress.deleteMany({ where: { tenantId: TID } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Exceptions and alerts need asset read access', () => {
  it('refuses a user without asset:read', async () => {
    expect((await request(app).get('/api/v1/exceptions').set(as(noAccess()))).status).toBe(403);
    expect((await request(app).get('/api/v1/alerts/subscriptions').set(as(noAccess()))).status).toBe(403);
    const sub = await request(app).post('/api/v1/alerts/subscriptions').set(as(noAccess()))
      .send({ exceptionType: 'warranty_expired' });
    expect(sub.status).toBe(403);
  });

  it('allows a user with asset:read', async () => {
    expect((await request(app).get('/api/v1/exceptions').set(as(viewer()))).status).toBe(200);
    expect((await request(app).get('/api/v1/alerts/subscriptions').set(as(viewer()))).status).toBe(200);
  });
});

describe('Onboarding writes need company:manage', () => {
  it('lets anyone signed in read progress and the company', async () => {
    expect((await request(app).get('/api/v1/onboarding/progress').set(as(noAccess()))).status).toBe(200);
    expect((await request(app).get('/api/v1/onboarding/company').set(as(noAccess()))).status).toBe(200);
  });

  it.each([
    ['/api/v1/onboarding/user', { name: 'Mallory' }],
    ['/api/v1/onboarding/company', { companyName: 'Hijacked Ltd', address: 'x', city: 'x', country: 'GB' }],
    ['/api/v1/onboarding/client', { clientName: 'X', contactEmail: 'x@x.test', signatoryName: 'X', signatoryEmail: 'x@x.test' }],
    ['/api/v1/onboarding/licence', { tierName: 'TIER_3' }],
    ['/api/v1/onboarding/complete', {}],
  ])('refuses POST %s without company:manage', async (path, body) => {
    const res = await request(app).post(path).set(as(viewer())).send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_REQUIRED');
  });

  it('refuses a logo delete without company:manage', async () => {
    expect((await request(app).delete('/api/v1/onboarding/company/logo').set(as(viewer()))).status).toBe(403);
  });

  it('lets an administrator past the guard', async () => {
    const res = await request(app).post('/api/v1/onboarding/user').set(as(admin())).send({ name: 'Admin' });
    expect(res.status).not.toBe(403);
  });
});

describe('Disabling two-factor needs a current code', () => {
  beforeEach(async () => {
    // otplib is mocked: '123456' is the only valid code (src/__mocks__/otplib.ts).
    await prisma.userTwoFactor.upsert({
      where: { userId },
      update: { verifiedAt: new Date(), secret: encryptSecret('MOCK_SECRET_BASE32_VALUE'), backupCodes: [] },
      create: { userId, verifiedAt: new Date(), secret: encryptSecret('MOCK_SECRET_BASE32_VALUE'), backupCodes: [] },
    });
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  });

  const disable = (body: object) =>
    request(app).post('/api/v1/2fa/disable').set(as(viewer())).send(body);
  const stillEnabled = async () => !!(await prisma.userTwoFactor.findUnique({ where: { userId } }));

  it('refuses with no code', async () => {
    expect((await disable({})).status).toBe(400);
    expect(await stillEnabled()).toBe(true);
  });

  it('refuses with a wrong code', async () => {
    expect((await disable({ token: '000000' })).status).toBe(400);
    expect(await stillEnabled()).toBe(true);
  });

  it('disables with a current code', async () => {
    expect((await disable({ token: '123456' })).status).toBe(200);
    expect(await stillEnabled()).toBe(false);
  });

  it('cancels an unverified set-up without a code', async () => {
    await prisma.userTwoFactor.update({ where: { userId }, data: { verifiedAt: null } });
    expect((await disable({})).status).toBe(200);
  });
});
