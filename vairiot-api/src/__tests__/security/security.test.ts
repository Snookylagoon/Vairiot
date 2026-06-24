import request from 'supertest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../app';

const prisma = new PrismaClient();
const app    = createApp();

const TID  = 'test-security';

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID },
    update: { name: 'Security Test', active: true, onboardingComplete: true },
    create: { id: TID, name: 'Security Test', active: true, onboardingComplete: true },
  });

  // Seed licence
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, pricePerDevice: 10, isPerpetual: true },
  });
  const existingLicence = await prisma.licence.findFirst({ where: { tenantId: TID, status: 'active' } });
  if (!existingLicence) {
    await prisma.licence.create({
      data: { tenantId: TID, tierId: tier.id, licenceNumber: `VAI-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
    });
  }
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { email: { contains: '@sec.test' } } });
  await prisma.userTwoFactor.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

// ── Password Policy ──────────────────────────────────────────────────────────

describe('Password policy', () => {
  let adminToken: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('AdminPassword1!', 4);
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: TID, name: 'Company Admin' } },
      update: { permissions: ['user:read', 'user:write'], isSystem: true },
      create: { tenantId: TID, name: 'Company Admin', permissions: ['user:read', 'user:write'], isSystem: true },
    });
    const admin = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TID, email: 'admin@sec.test' } },
      update: { passwordHash: hash },
      create: { tenantId: TID, email: 'admin@sec.test', name: 'Admin', passwordHash: hash, active: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: {},
      create: { userId: admin.id, roleId: role.id },
    });
    adminToken = (await request(app).post('/api/v1/auth/login')
      .send({ email: 'admin@sec.test', password: 'AdminPassword1!', tenantId: TID })).body.accessToken;
  });

  it('rejects password shorter than 12 characters', async () => {
    const res = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'weak@sec.test', name: 'Weak', password: 'Short123' });
    expect(res.status).toBe(400);
  });

  it('rejects password longer than 12 characters', async () => {
    const res = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'weak2@sec.test', name: 'Weak', password: 'WayTooLong12345' });
    expect(res.status).toBe(400);
  });

  it('rejects password containing a special character', async () => {
    const res = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'weak3@sec.test', name: 'Weak', password: 'HasSpecial1!' });
    expect(res.status).toBe(400);
  });

  it('accepts a 12-character alphanumeric password', async () => {
    const res = await request(app).post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'strong@sec.test', name: 'Strong', password: 'StrongPass12' });
    expect(res.status).toBe(201);
  });
});

// ── Progressive Lockout ──────────────────────────────────────────────────────

describe('Progressive lockout', () => {
  beforeAll(async () => {
    const hash = await bcrypt.hash('LockoutTest1!', 4);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TID, email: 'lockout@sec.test' } },
      update: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      create: { tenantId: TID, email: 'lockout@sec.test', name: 'Lockout', passwordHash: hash, active: true },
    });
  });

  it('locks account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login')
        .send({ email: 'lockout@sec.test', password: 'WrongPassword1!', tenantId: TID });
    }

    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'lockout@sec.test', password: 'LockoutTest1!', tenantId: TID });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('resets on successful login after lock expires', async () => {
    // Manually clear the lock for testing
    await prisma.user.updateMany({
      where: { tenantId: TID, email: 'lockout@sec.test' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'lockout@sec.test', password: 'LockoutTest1!', tenantId: TID });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});

// ── 2FA ──────────────────────────────────────────────────────────────────────

describe('Two-factor authentication', () => {
  let userToken: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('TwoFactorTest1!', 4);
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: TID, name: 'Viewer' } },
      update: { permissions: ['asset:read', 'site:read', 'category:read', 'report:read'], isSystem: true },
      create: { tenantId: TID, name: 'Viewer', permissions: ['asset:read', 'site:read', 'category:read', 'report:read'], isSystem: true },
    });
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TID, email: 'tfa@sec.test' } },
      update: { passwordHash: hash, twoFactorEnabled: false },
      create: { tenantId: TID, email: 'tfa@sec.test', name: '2FA User', passwordHash: hash, active: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    userToken = (await request(app).post('/api/v1/auth/login')
      .send({ email: 'tfa@sec.test', password: 'TwoFactorTest1!', tenantId: TID })).body.accessToken;
  });

  it('returns 2FA status', async () => {
    const res = await request(app).get('/api/v1/2fa/status')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.required).toBe(false);
  });

  it('can initiate 2FA setup', async () => {
    const res = await request(app).post('/api/v1/2fa/setup')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('secret');
    expect(res.body).toHaveProperty('otpauthUrl');
    expect(res.body.backupCodes).toHaveLength(8);
  });

  it('rejects invalid verification code', async () => {
    const res = await request(app).post('/api/v1/2fa/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ token: '000000' });
    expect(res.status).toBe(400);
  });

  it('accepts valid verification code (mock returns true for 123456)', async () => {
    const res = await request(app).post('/api/v1/2fa/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ token: '123456' });
    expect(res.status).toBe(200);
  });

  it('shows enabled after verification', async () => {
    const res = await request(app).get('/api/v1/2fa/status')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  it('login returns 2FA challenge when enabled', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'tfa@sec.test', password: 'TwoFactorTest1!', tenantId: TID });
    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
    expect(res.body.twoFactorChallengeToken).toBeDefined();
  });

  it('completes login with 2FA token', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'tfa@sec.test', password: 'TwoFactorTest1!', tenantId: TID });
    const { twoFactorChallengeToken } = loginRes.body;

    const res = await request(app).post('/api/v1/auth/login/2fa')
      .send({ challengeToken: twoFactorChallengeToken, token: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('can disable 2FA (non-mandatory role)', async () => {
    const res = await request(app).post('/api/v1/2fa/disable')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });
});

// ── 2FA mandatory enforcement ────────────────────────────────────────────────

describe('2FA mandatory for platform roles', () => {
  let platformToken: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('PlatformAdmin1!', 4);
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: TID, name: 'Platform Super Admin' } },
      update: { permissions: ['asset:read', 'user:read', 'user:write', 'system:configure'], isSystem: true },
      create: { tenantId: TID, name: 'Platform Super Admin', permissions: ['asset:read', 'user:read', 'user:write', 'system:configure'], isSystem: true },
    });
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TID, email: 'platform@sec.test' } },
      update: { passwordHash: hash, twoFactorEnabled: true },
      create: { tenantId: TID, email: 'platform@sec.test', name: 'Platform', passwordHash: hash, active: true, twoFactorEnabled: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    // Set up verified 2FA record
    await prisma.userTwoFactor.upsert({
      where: { userId: user.id },
      update: { secret: 'MOCK_SECRET', backupCodes: ['BACKUP01'], verifiedAt: new Date() },
      create: { userId: user.id, secret: 'MOCK_SECRET', backupCodes: ['BACKUP01'], verifiedAt: new Date() },
    });

    // Login requires 2FA, complete it with mock token
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'platform@sec.test', password: 'PlatformAdmin1!', tenantId: TID });
    const tfaRes = await request(app).post('/api/v1/auth/login/2fa')
      .send({ challengeToken: loginRes.body.twoFactorChallengeToken, token: '123456' });
    platformToken = tfaRes.body.accessToken;
  });

  it('2FA status shows required=true for platform role', async () => {
    const res = await request(app).get('/api/v1/2fa/status')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.status).toBe(200);
    expect(res.body.required).toBe(true);
  });

  it('cannot disable 2FA for mandatory role', async () => {
    const res = await request(app).post('/api/v1/2fa/disable')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TWO_FA_MANDATORY');
  });
});
