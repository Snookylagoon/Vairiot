import request from 'supertest';
import { ALL_PERMISSIONS, ROLE_PERMISSION_MATRIX } from 'vairiot-shared';

import { seedTuda, TUDA_ROLES, TUDA_TENANT_ID, TUDA_TENANT_NAME } from '../../../prisma/seed-tuda';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

// S0.6: the TUDA seed profile and the closed-registration switch.

const app = createApp();
const ADMIN = 'tuda.admin@example.ge';
const PASS = 'Tbilisi-Transit-2026!';

async function wipeTuda() {
  await flushAuditEvents();
  const users = await prisma.user.findMany({ where: { tenantId: TUDA_TENANT_ID }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditEvent.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.loginAttempt.deleteMany({ where: { email: ADMIN } });
  await prisma.userInvitation.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.role.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.onboardingProgress.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TUDA_TENANT_ID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.company.deleteMany({ where: { tenantId: TUDA_TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TUDA_TENANT_ID } });
}

beforeAll(wipeTuda);
afterAll(async () => {
  await wipeTuda();
  await prisma.$disconnect();
});

describe('seed:tuda', () => {
  let inviteUrl = '';

  it('creates the standalone TUDA tenant with GEL, GE and Asia/Tbilisi', async () => {
    const result = await seedTuda({ adminEmail: ADMIN, adminName: 'Nino Example', appUrl: 'https://assets.tuda.example/' });
    expect(result.admin).toBe('invited');
    inviteUrl = result.inviteUrl!;
    expect(inviteUrl).toMatch(/^https:\/\/assets\.tuda\.example\/accept-invite\?token=[0-9a-f]{64}$/);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: TUDA_TENANT_ID }, include: { company: true } });
    expect(tenant.name).toBe(TUDA_TENANT_NAME);
    expect(tenant.deploymentMode).toBe('standalone');
    expect(tenant.onboardingComplete).toBe(true);
    expect(tenant.featureFlags).toMatchObject({ gis: true, ipsas: true, reconciliation: true });
    expect(tenant.company).toMatchObject({ currency: 'GEL', country: 'GE', timezone: 'Asia/Tbilisi' });
  });

  it('creates exactly the six TUDA roles, each with valid tenant-level permissions', async () => {
    const roles = await prisma.role.findMany({ where: { tenantId: TUDA_TENANT_ID } });
    expect(roles.map((r) => r.name).sort()).toEqual(
      ['Administrator', 'Field Operator', 'Finance', 'Inventory Manager', 'Verifier', 'Viewer'],
    );
    for (const role of roles) {
      for (const perm of role.permissions) expect(ALL_PERMISSIONS).toContain(perm);
      // Never platform powers in a tenant role.
      expect(role.permissions).not.toContain('licence:manage');
      expect(role.permissions).not.toContain('system:configure');
    }
  });

  it('gives Administrator everything the built-in Company Admin has, plus audits', () => {
    const companyAdmin = ROLE_PERMISSION_MATRIX.find((r) => r.name === 'Company Admin')!.permissions;
    for (const perm of companyAdmin) expect(TUDA_ROLES.Administrator).toContain(perm);
    expect(TUDA_ROLES.Administrator).toEqual(expect.arrayContaining(['audit:write', 'scan:execute']));
  });

  it('lets field operators count but not edit the register', () => {
    expect(TUDA_ROLES['Field Operator']).toEqual(expect.arrayContaining(['scan:execute', 'audit:write']));
    expect(TUDA_ROLES['Field Operator']).not.toContain('asset:write');
    expect(TUDA_ROLES.Finance).not.toContain('asset:write');
    expect(TUDA_ROLES.Viewer).not.toContain('audit:write');
  });

  it('activates an Enterprise licence with payment confirmed', async () => {
    const licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: TUDA_TENANT_ID }, include: { tier: true } });
    expect(licence.status).toBe('active');
    expect(licence.tier.name).toBe('TIER_3');
    expect(licence.paymentConfirmed).toBe(true);
  });

  it('invites the administrator without a password; the invite activates the account', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: TUDA_TENANT_ID, email: ADMIN } } });
    expect(user.active).toBe(false);
    expect(user.passwordHash).toBeNull();

    const token = new URL(inviteUrl).searchParams.get('token');
    const accept = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: PASS });
    expect(accept.status).toBeLessThan(300);

    const login = await request(app).post('/api/v1/auth/login').send({ email: ADMIN, password: PASS, tenantId: TUDA_TENANT_ID });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.body.roles).toEqual(['Administrator']);
    expect(me.body.permissions).toEqual(expect.arrayContaining(['user:write', 'audit:write', 'company:manage']));
  });

  it('is safe to run again: nothing duplicated, the active admin is left alone', async () => {
    const before = await prisma.role.count({ where: { tenantId: TUDA_TENANT_ID } });
    const again = await seedTuda({ adminEmail: ADMIN });
    expect(again.admin).toBe('already-active');
    expect(again.inviteUrl).toBeUndefined();
    expect(await prisma.role.count({ where: { tenantId: TUDA_TENANT_ID } })).toBe(before);
    expect(await prisma.licence.count({ where: { tenantId: TUDA_TENANT_ID } })).toBe(1);
    expect(await prisma.tenant.count({ where: { id: TUDA_TENANT_ID } })).toBe(1);
  });

  it('rejects a malformed admin email', async () => {
    await expect(seedTuda({ adminEmail: 'not-an-email' })).rejects.toThrow(/not an email address/);
  });
});

describe('ALLOW_REGISTRATION=false (standalone)', () => {
  afterEach(() => { delete process.env.ALLOW_REGISTRATION; });

  it('refuses public registration', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    const r = await request(app).post('/api/v1/auth/register').send({
      organisationName: 'Should Not Exist Ltd', name: 'Someone', email: 'someone@example.com', password: 'Long-enough-password-1',
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('REGISTRATION_CLOSED');
    expect(await prisma.tenant.count({ where: { name: 'Should Not Exist Ltd' } })).toBe(0);
  });
});
