/**
 * Seed profile: TUDA — Tbilisi Transport and Urban Development Agency.
 *
 *   TUDA_ADMIN_EMAIL=admin@example.ge npm run seed:tuda --workspace=vairiot-api
 *
 * Creates (or brings up to date — safe to run again) the single tenant of a
 * standalone TUDA install:
 *   - tenant in standalone mode, onboarding complete, with feature flags
 *     gis, ipsas and reconciliation on;
 *   - company record: GEL, Georgia (GE), Asia/Tbilisi;
 *   - TUDA's six roles (Administrator, Finance, Inventory Manager, Field
 *     Operator, Verifier, Viewer) with the permissions below;
 *   - an Enterprise licence (unlimited assets);
 *   - the first Administrator, by invitation: no password is set here. The
 *     invite link is printed (and emailed when the worker and mail are set
 *     up); the administrator chooses a password when accepting it.
 *
 * Settings: TUDA_ADMIN_EMAIL (required), TUDA_ADMIN_NAME, APP_URL (the web
 * address, for the invite link), DATABASE_URL.
 */
import crypto from 'node:crypto';

import { LICENCE_TIER_CONFIG, Permission } from 'vairiot-shared';

import { prisma } from '../src/lib/prisma';
import { activateLicence } from '../src/services/licence.service';

export const TUDA_TENANT_ID = 'tuda';
export const TUDA_TENANT_NAME = 'TUDA — Tbilisi Transport and Urban Development Agency';
const INVITE_HOURS = 7 * 24;

const P = Permission;
const READ_REGISTER = [P.AssetRead, P.SiteRead, P.CategoryRead];

/**
 * TUDA's roles. Names are TUDA's own; access is by permission, so these work
 * like the built-in roles (only platform routes check role names).
 */
export const TUDA_ROLES: Record<string, string[]> = {
  // Runs the system: everything a tenant can do, including audits.
  Administrator: [
    P.AssetRead, P.AssetWrite, P.AssetDelete, P.SiteRead, P.SiteWrite, P.CategoryRead, P.CategoryWrite,
    P.AuditRead, P.AuditWrite, P.ScanExecute, P.Gs1Admin, P.TagCommission, P.DeviceManage,
    P.ReportRead, P.ReportExport, P.WorkOrderRead, P.WorkOrderWrite,
    P.UserRead, P.UserWrite, P.ApiKeyRead, P.ApiKeyWrite, P.CompanyManage, P.ClientRead, P.ClientManage,
  ],
  // Values, depreciation and reports; reads the register, doesn't edit it.
  Finance: [...READ_REGISTER, P.AuditRead, P.ReportRead, P.ReportExport],
  // Maintains the register and plans counts.
  'Inventory Manager': [
    P.AssetRead, P.AssetWrite, P.AssetDelete, P.SiteRead, P.SiteWrite, P.CategoryRead, P.CategoryWrite,
    P.AuditRead, P.AuditWrite, P.ScanExecute, P.TagCommission, P.DeviceManage,
    P.ReportRead, P.ReportExport, P.WorkOrderRead,
  ],
  // Counts and tags in the field (scanners); can't change the register.
  'Field Operator': [...READ_REGISTER, P.AuditRead, P.AuditWrite, P.ScanExecute, P.TagCommission],
  // Independent check of counts and results.
  Verifier: [...READ_REGISTER, P.AuditRead, P.AuditWrite, P.ScanExecute, P.ReportRead, P.ReportExport],
  Viewer: [...READ_REGISTER, P.ReportRead],
};

export interface TudaSeedOptions {
  adminEmail: string;
  adminName?: string;
  appUrl?: string;
}

export interface TudaSeedResult {
  tenantId: string;
  admin: 'invited' | 'reinvited' | 'already-active';
  inviteUrl?: string;
  licenceNumber: string;
}

export async function seedTuda(opts: TudaSeedOptions): Promise<TudaSeedResult> {
  const adminEmail = opts.adminEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) throw new Error(`TUDA_ADMIN_EMAIL is not an email address: ${opts.adminEmail}`);
  const appUrl = (opts.appUrl || 'http://localhost:3000').replace(/\/$/, '');

  // ── Tenant ──────────────────────────────────────────────────────────────
  const featureFlags = { gis: true, ipsas: true, reconciliation: true };
  const existing = await prisma.tenant.findUnique({ where: { id: TUDA_TENANT_ID } });
  const tenant = await prisma.tenant.upsert({
    where: { id: TUDA_TENANT_ID },
    update: {
      name: TUDA_TENANT_NAME, deploymentMode: 'standalone', plan: 'standalone', active: true, onboardingComplete: true,
      // Keep any flags set since; make sure these three are on.
      featureFlags: { ...((existing?.featureFlags as Record<string, unknown>) ?? {}), ...featureFlags },
    },
    create: {
      id: TUDA_TENANT_ID, name: TUDA_TENANT_NAME, deploymentMode: 'standalone', plan: 'standalone',
      active: true, onboardingComplete: true, featureFlags,
    },
  });

  // ── Company (currency, country, time zone) ─────────────────────────────
  // Address and contact are placeholders for TUDA to complete in the app
  // (Company settings); the schema requires them.
  await prisma.company.upsert({
    where: { tenantId: tenant.id },
    update: { currency: 'GEL', country: 'GE', timezone: 'Asia/Tbilisi' },
    create: {
      tenantId: tenant.id,
      legalName: 'Tbilisi Transport and Urban Development Agency',
      tradingName: 'TUDA',
      addressLine1: 'To be completed',
      city: 'Tbilisi',
      country: 'GE',
      currency: 'GEL',
      timezone: 'Asia/Tbilisi',
      primaryContactName: opts.adminName?.trim() || 'TUDA administrator',
      primaryContactEmail: adminEmail,
    },
  });

  // ── Roles ───────────────────────────────────────────────────────────────
  const roleIds: Record<string, string> = {};
  for (const [name, permissions] of Object.entries(TUDA_ROLES)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: { permissions, isSystem: true },
      create: { tenantId: tenant.id, name, permissions, isSystem: true },
    });
    roleIds[name] = role.id;
  }

  // ── Licence: Enterprise (unlimited assets), confirmed under the contract ─
  // ── First administrator (created before the licence so the licence's
  //    audit event has a real actor: audit_events.actorId references users) ─
  let user = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } } });
  const alreadyActive = Boolean(user?.active && user.passwordHash);
  const reinvite = Boolean(user) && !alreadyActive;
  if (!user) {
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: adminEmail, name: opts.adminName?.trim() || 'TUDA administrator', active: false },
    });
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: roleIds.Administrator } },
    update: {},
    create: { userId: user.id, roleId: roleIds.Administrator, grantedBy: 'seed:tuda' },
  });

  // ── Licence: Enterprise (unlimited assets), confirmed under the contract ─
  for (const [name, cfg] of Object.entries(LICENCE_TIER_CONFIG)) {
    await prisma.licenceTier.upsert({
      where: { name: name as never },
      update: {},
      create: {
        name: name as never, displayName: cfg.displayName, maxAssets: cfg.maxAssets, baseDevices: cfg.baseDevices,
        pricePerYear: cfg.pricePerYear, pricePerDevice: cfg.pricePerDevice, isPerpetual: cfg.isPerpetual,
      },
    });
  }
  let licence = await prisma.licence.findFirst({ where: { tenantId: tenant.id, status: { in: ['active', 'expiring'] } } });
  if (!licence) {
    await activateLicence(tenant.id, 'TIER_3', user.id);
    licence = await prisma.licence.findFirstOrThrow({ where: { tenantId: tenant.id, status: 'active' } });
    licence = await prisma.licence.update({
      where: { id: licence.id },
      data: { paymentConfirmed: true, paymentConfirmedAt: new Date(), paymentConfirmedBy: 'seed:tuda', notes: 'Standalone TUDA installation (seed:tuda).' },
    });
  }

  // ── Onboarding: done (the seed supplies what the wizard would collect) ──
  for (const step of ['user_registration', 'company_registration', 'licence_activation'] as const) {
    await prisma.onboardingProgress.upsert({
      where: { tenantId_step: { tenantId: tenant.id, step } },
      update: {},
      create: { tenantId: tenant.id, step, completed: true, completedAt: new Date(), completedBy: user.id },
    });
  }

  if (alreadyActive) {
    return { tenantId: tenant.id, admin: 'already-active', licenceNumber: licence.licenceNumber };
  }

  // ── Invitation: the administrator sets their own password ───────────────
  // A fresh invitation each run; earlier unused ones stop working.
  await prisma.userInvitation.deleteMany({ where: { userId: user.id, accepted: false } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.userInvitation.create({
    data: {
      tenantId: tenant.id, userId: user.id, token, createdBy: user.id,
      expiresAt: new Date(Date.now() + INVITE_HOURS * 3600 * 1000),
    },
  });
  return {
    tenantId: tenant.id,
    admin: reinvite ? 'reinvited' : 'invited',
    inviteUrl: `${appUrl}/accept-invite?token=${token}`,
    licenceNumber: licence.licenceNumber,
  };
}

/* eslint-disable no-console -- command-line output is this script's job */
async function main(): Promise<void> {
  const adminEmail = process.env.TUDA_ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('Set TUDA_ADMIN_EMAIL to the first administrator\'s email address.');
    process.exit(1);
  }
  const result = await seedTuda({ adminEmail, adminName: process.env.TUDA_ADMIN_NAME, appUrl: process.env.APP_URL });
  console.log(`✅ ${TUDA_TENANT_NAME}`);
  console.log(`   tenant id:   ${result.tenantId}  (standalone; gis, ipsas, reconciliation on; GEL, GE, Asia/Tbilisi)`);
  console.log(`   roles:       ${Object.keys(TUDA_ROLES).join(', ')}`);
  console.log(`   licence:     ${result.licenceNumber} (Enterprise, unlimited assets; renew before it expires in 12 months)`);
  if (result.admin === 'already-active') {
    console.log(`   admin:       ${adminEmail} is already active (no new invitation)`);
  } else {
    console.log(`   admin:       ${adminEmail} ${result.admin === 'reinvited' ? 're-invited' : 'invited'} as Administrator; the link is valid for 7 days:`);
    console.log(`\n   ${result.inviteUrl}\n`);
    console.log('   Open it to choose a password. Sign in with tenant "tuda".');
  }
}

/* eslint-enable no-console */

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
