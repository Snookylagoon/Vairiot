import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';

const prisma = new PrismaClient();
const app    = createApp();

const TID  = 'test-onboarding';
const PASS = 'TestPassword1!';

let token: string;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASS, 4);

  // Tenant with onboarding NOT complete
  await prisma.tenant.upsert({
    where: { id: TID },
    update: { name: 'Onboarding Test', active: true, onboardingComplete: false },
    create: { id: TID, name: 'Onboarding Test', active: true, onboardingComplete: false },
  });

  // Seed licence tier
  await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, pricePerDevice: 10, isPerpetual: true },
  });

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Company Admin' } },
    update: { permissions: ['asset:read', 'asset:write', 'user:read', 'user:write'], isSystem: true },
    create: { tenantId: TID, name: 'Company Admin', permissions: ['asset:read', 'asset:write', 'user:read', 'user:write'], isSystem: true },
  });

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: 'onb@test.com' } },
    update: { passwordHash: hash },
    create: { tenantId: TID, email: 'onb@test.com', name: 'Onboarder', passwordHash: hash, active: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  token = (await request(app).post('/api/v1/auth/login')
    .send({ email: 'onb@test.com', password: PASS, tenantId: TID })).body.accessToken;
});

afterAll(async () => {
  await prisma.onboardingProgress.deleteMany({ where: { tenantId: TID } });
  await prisma.company.deleteMany({ where: { tenantId: TID } });
  await prisma.clientAuthority.deleteMany({ where: { clientCompany: { tenantId: TID } } });
  await prisma.clientCompany.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.delete({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Onboarding gate', () => {
  it('blocks gated routes when onboarding is incomplete', async () => {
    const res = await request(app).get('/api/v1/assets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('allows access to onboarding routes', async () => {
    const res = await request(app).get('/api/v1/onboarding/progress')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nextStep');
  });
});

describe('Onboarding wizard steps', () => {
  it('step 1: complete user registration', async () => {
    const res = await request(app).post('/api/v1/onboarding/user')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test User', email: 'onb@test.com', phone: '+64211234567' });
    expect(res.status).toBe(200);
  });

  it('step 2: register company', async () => {
    const res = await request(app).post('/api/v1/onboarding/company')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Test Corp Ltd',
        address: '123 Test St',
        city: 'Wellington',
        country: 'New Zealand',
        registrationNumber: 'NZ123',
      });
    expect(res.status).toBe(200);
  });

  it('step 3: register client (optional)', async () => {
    const res = await request(app).post('/api/v1/onboarding/client')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientName: 'Client Co Ltd',
        contactEmail: 'jane@client.com',
        signatoryName: 'Jane Doe',
        signatoryEmail: 'jane@client.com',
      });
    expect(res.status).toBe(200);
  });

  it('step 4: activate licence', async () => {
    const res = await request(app).post('/api/v1/onboarding/licence')
      .set('Authorization', `Bearer ${token}`)
      .send({ tierName: 'FREE' });
    expect(res.status).toBe(200);
  });

  it('finalise onboarding', async () => {
    const res = await request(app).post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('gated routes now accessible after onboarding', async () => {
    // Re-login to get fresh token with updated tenant state
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'onb@test.com', password: PASS, tenantId: TID });
    const freshToken = loginRes.body.accessToken;

    const res = await request(app).get('/api/v1/assets')
      .set('Authorization', `Bearer ${freshToken}`);
    expect(res.status).toBe(200);
  });
});
