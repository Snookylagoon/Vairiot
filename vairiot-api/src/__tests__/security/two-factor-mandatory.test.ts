import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Mandatory two-factor for administrators with a 14-day grace (D6, stage 1.18).

const app = createApp();
const TID = 'test-two-factor-mandatory';
const PASS = 'TestPassword123!';
const DAY = 24 * 3600 * 1000;
const ids: Record<string, string> = {};

async function user(role: string) {
  const email = `${role.replace(/\s/g, '').toLowerCase()}@mfa.test`;
  const r = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: role } }, update: {}, create: { tenantId: TID, name: role, permissions: ['asset:read'] } });
  const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email } }, update: {}, create: { tenantId: TID, email, name: role, passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: r.id } }, update: {}, create: { userId: u.id, roleId: r.id } });
  ids[role] = u.id;
  return email;
}
const login = (email: string) => request(app).post('/api/v1/auth/login').send({ email, password: PASS, tenantId: TID });

let adminEmail: string;
let operatorEmail: string;

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'MFA', onboardingComplete: true } });
  await ensureTestLicence(TID);
  adminEmail = await user('Administrator');
  operatorEmail = await user('Field Operator');
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.loginAttempt.deleteMany({ where: { email: { endsWith: '@mfa.test' } } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('during the grace period', () => {
  it('signs an administrator in and says when two-factor is due', async () => {
    const r = await login(adminEmail);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeDefined();
    const due = new Date(r.body.twoFactorSetupDueBy).getTime();
    expect(Math.round((due - Date.now()) / DAY)).toBe(14);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${r.body.accessToken}`);
    expect(me.body.twoFactorSetupDueBy).toBe(r.body.twoFactorSetupDueBy);
  });

  it('keeps the first start date on later sign-ins', async () => {
    const first = await prisma.user.findUnique({ where: { id: ids.Administrator } });
    await login(adminEmail);
    const again = await prisma.user.findUnique({ where: { id: ids.Administrator } });
    expect(again!.twoFactorGraceStartedAt).toEqual(first!.twoFactorGraceStartedAt);
  });

  it('never requires two-factor of field roles', async () => {
    const r = await login(operatorEmail);
    expect(r.body.accessToken).toBeDefined();
    expect(r.body.twoFactorSetupDueBy).toBeUndefined();
  });
});

describe('after the grace period', () => {
  it('sends an administrator to enrolment and refuses refreshes', async () => {
    const before = await login(adminEmail);
    await prisma.user.update({ where: { id: ids.Administrator }, data: { twoFactorGraceStartedAt: new Date(Date.now() - 15 * DAY) } });

    const r = await login(adminEmail);
    expect(r.body).toMatchObject({ requiresTwoFactorSetup: true });
    expect(r.body.accessToken).toBeUndefined();
    expect(r.body.twoFactorSetupToken).toBeDefined();

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: before.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});
