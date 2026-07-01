import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { buildOrderBy } from '../lib/sort';
import { ROLE_PERMISSION_MATRIX } from 'vairiot-shared';
import { validatePasswordPolicy } from './password-policy.service';
import { activateLicence } from './licence.service';
import { sendMail } from './smtp.service';

const TENANT_SORT_KEYS = ['name', 'deploymentMode', 'onboardingComplete', 'createdAt', 'active'] as const;
const USER_SORT_KEYS   = ['name', 'email', 'active', 'twoFactorEnabled', 'lastLoginAt', 'createdAt', 'tenant.name'] as const;

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const [
    totalTenants,
    activeLicences,
    expiringLicences,
    expiredLicences,
    suspendedLicences,
    totalUsers,
    totalAssets,
    recentTenants,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.licence.count({ where: { status: 'active' } }),
    prisma.licence.count({ where: { status: 'expiring' } }),
    prisma.licence.count({ where: { status: 'expired' } }),
    prisma.licence.count({ where: { status: 'suspended' } }),
    prisma.user.count(),
    prisma.asset.count({ where: { deletedAt: null } }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        deploymentMode: true,
        onboardingComplete: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    totalTenants,
    activeLicences,
    expiringLicences,
    expiredLicences,
    suspendedLicences,
    totalUsers,
    totalAssets,
    recentTenants,
  };
}

// ─── Tenant Management ──────────────────────────────────────────────────────

interface TenantListFilters {
  search?: string;
  deploymentMode?: string;
  onboardingComplete?: string;
  sortBy?: string;
  sortOrder?: string;
}

export async function listTenants(filters: TenantListFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.deploymentMode) {
    where.deploymentMode = filters.deploymentMode;
  }
  if (filters.onboardingComplete !== undefined) {
    where.onboardingComplete = filters.onboardingComplete === 'true';
  }

  return prisma.tenant.findMany({
    where,
    orderBy: buildOrderBy(filters.sortBy, filters.sortOrder, TENANT_SORT_KEYS, { createdAt: 'desc' as const }),
    select: {
      id: true,
      name: true,
      deploymentMode: true,
      onboardingComplete: true,
      active: true,
      createdAt: true,
      _count: { select: { users: true, assets: true } },
      licences: {
        where: { status: { notIn: ['revoked'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          tier: { select: { name: true, displayName: true } },
        },
      },
    },
  });
}

export async function getTenantDetail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      company: true,
      clientCompanies: {
        select: {
          id: true,
          legalName: true,
          tradingName: true,
          registrationNumber: true,
          createdAt: true,
        },
      },
      childTenants: {
        select: {
          id: true,
          name: true,
            active: true,
          createdAt: true,
          _count: { select: { assets: true } },
          company: {
            select: {
              addressLine1: true,
              city: true,
              country: true,
              primaryContactPhone: true,
              logoStorageKey: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          lastLoginAt: true,
          createdAt: true,
          roles: { include: { role: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
      licences: {
        orderBy: { createdAt: 'desc' },
        include: {
          tier: true,
          deviceSlots: true,
        },
      },
      _count: {
        select: {
          assets: true,
          devices: true,
          auditCampaigns: true,
        },
      },
    },
  });

  if (!tenant) throw new NotFoundError('Tenant not found');

  // Aggregate asset count across parent + children for licensing display
  const childIds = tenant.childTenants.map(c => c.id);
  const familyIds = [tenantId, ...childIds];
  const totalFamilyAssets = await prisma.asset.count({
    where: { tenantId: { in: familyIds }, deletedAt: null },
  });

  return { ...tenant, totalFamilyAssets };
}

// ─── Cross-Tenant User Management ───────────────────────────────────────────

interface UserListFilters {
  search?: string;
  tenantId?: string;
  role?: string;
  active?: string;
  sortBy?: string;
  sortOrder?: string;
}

export async function listAllUsers(filters: UserListFilters = {}) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.active !== undefined) where.active = filters.active === 'true';
  if (filters.role) {
    where.roles = { some: { role: { name: filters.role } } };
  }

  return prisma.user.findMany({
    where,
    orderBy: buildOrderBy(filters.sortBy, filters.sortOrder, USER_SORT_KEYS, { createdAt: 'desc' as const }),
    select: {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      active: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      failedLoginCount: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
      tenant: { select: { name: true } },
      roles: { include: { role: { select: { name: true } } } },
    },
  });
}

export async function adminResetPassword(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_password_reset',
      metadata: { resetBy: actorId },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return { temporaryPassword: tempPassword };
}

export async function unlockUser(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_user_unlocked',
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));
}

/**
 * Platform Super Admin action: require the user to change their password
 * on next sign-in. Leaves the existing password in place — useful when you
 * want to enforce a rotation without handing out a temp password.
 */
export async function requirePasswordChange(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: true },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_force_password_change',
      metadata: { email: user.email },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return { mustChangePassword: true };
}

/**
 * Clear the force-password-change flag without changing the password.
 */
export async function clearForcePasswordChange(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: false },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_clear_force_password_change',
      metadata: { email: user.email },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return { mustChangePassword: false };
}

/**
 * Platform Super Admin action: disable 2FA on a user's account.
 * Clears any stored TOTP secret and backup codes. The user can re-enrol
 * themselves from their own security settings on next sign-in.
 */
export async function disableUserTwoFactor(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.userTwoFactor.deleteMany({ where: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_two_factor_disabled',
      metadata: { email: user.email },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return { twoFactorEnabled: false };
}

export async function setUserActiveStatus(userId: string, active: boolean, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.user.update({
    where: { id: userId },
    data: { active },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: active ? 'admin_user_enabled' : 'admin_user_disabled',
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));
}

export async function softDeleteUser(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');
  if (userId === actorId) {
    throw new Error('You cannot delete your own account.');
  }

  const now = new Date();
  // Scramble email so the (tenantId, email) unique constraint frees up for re-invitation.
  const scrambledEmail = `__deleted_${now.getTime()}__${user.email}`;

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: now,
        active: false,
        email: scrambledEmail,
      },
    }),
  ]);

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'admin_user_deleted',
      metadata: { originalEmail: user.email, originalName: user.name },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));
}

// ─── Admin-driven tenant creation ───────────────────────────────────────────

export interface AdminCreateTenantInput {
  organisationName: string;
  loginId?: string;
  adminName: string;
  adminEmail: string;
  adminMode: 'invite' | 'password';
  adminPassword?: string;
}

const LOGIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export function slugifyLoginId(source: string): string {
  return source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export interface AdminCreateTenantResult {
  tenantId: string;
  userId: string;
  adminMode: 'invite' | 'password';
  temporaryPassword?: string;
  inviteEmailSent?: boolean;
  inviteEmailError?: string;
}

/**
 * Platform Super Admin action: create a brand-new tenant with a primary
 * Company Admin user. Mirrors the self-registration flow (system roles,
 * FREE licence auto-activation, onboarding step seeded) but is initiated
 * by a platform admin on behalf of the tenant.
 */
export async function adminCreateTenant(
  input: AdminCreateTenantInput,
  actorId: string,
): Promise<AdminCreateTenantResult> {
  if (!input.organisationName?.trim()) throw new ValidationError('Organisation name is required');
  if (!input.adminName?.trim())        throw new ValidationError('Admin user name is required');
  if (!input.adminEmail?.trim())       throw new ValidationError('Admin user email is required');
  if (input.adminMode !== 'invite' && input.adminMode !== 'password') {
    throw new ValidationError('adminMode must be "invite" or "password"');
  }

  const tenantName = input.organisationName.trim();
  const email      = input.adminEmail.toLowerCase().trim();

  // Resolve the tenant Login ID. If the admin didn't type one, derive it from
  // the organisation name. Then validate + check uniqueness.
  const rawLoginId = (input.loginId?.trim() || slugifyLoginId(tenantName)).toLowerCase();
  if (!rawLoginId) throw new ValidationError('Login ID could not be derived from the organisation name — please enter one');
  if (rawLoginId.length < 3 || rawLoginId.length > 32) {
    throw new ValidationError('Login ID must be between 3 and 32 characters');
  }
  if (!LOGIN_ID_RE.test(rawLoginId)) {
    throw new ValidationError('Login ID must contain only lowercase letters, numbers, and hyphens (must start and end with a letter or number)');
  }
  const existingById = await prisma.tenant.findUnique({ where: { id: rawLoginId }, select: { id: true } });
  if (existingById) throw new ConflictError('That Login ID is already in use — pick another');

  const existingTenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
  if (existingTenant) throw new ConflictError('An organisation with this name already exists');

  let plainPassword: string;
  if (input.adminMode === 'password') {
    if (!input.adminPassword) throw new ValidationError('Password is required when adminMode is "password"');
    validatePasswordPolicy(input.adminPassword);
    plainPassword = input.adminPassword;
  } else {
    // Invite mode — generate a strong temporary password. Sent to user by email;
    // they must change it on first sign-in. Alphanumeric, 12 chars — matches the
    // set-password policy so it looks familiar and copies cleanly.
    plainPassword = generateTempPassword(12);
  }
  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const { user, tenant } = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: { id: rawLoginId, name: tenantName, onboardingComplete: false, active: false },
    });

    const roleDefs = ROLE_PERMISSION_MATRIX.filter((r) => r.isSystem);
    for (const def of roleDefs) {
      await tx.role.create({
        data: { tenantId: t.id, name: def.name, permissions: [...def.permissions], isSystem: true },
      });
    }
    const adminRole = await tx.role.findFirst({ where: { tenantId: t.id, name: 'Company Admin' } });
    if (!adminRole) throw new Error('Company Admin role not found after creation');

    const u = await tx.user.create({
      data: {
        tenantId: t.id,
        email,
        name: input.adminName.trim(),
        passwordHash,
        active: true,
        mustChangePassword: true,
      },
    });
    await tx.userRole.create({ data: { userId: u.id, roleId: adminRole.id } });

    return { user: u, tenant: t };
  });

  // Ensure licence tiers exist (idempotent — mirrors registration.service).
  await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0 },
  }).catch(() => {});
  await prisma.licenceTier.upsert({
    where: { name: 'TIER_2' }, update: {},
    create: { name: 'TIER_2', displayName: 'Professional', maxAssets: 1500, pricePerYear: 50 },
  }).catch(() => {});
  await prisma.licenceTier.upsert({
    where: { name: 'TIER_3' }, update: {},
    create: { name: 'TIER_3', displayName: 'Enterprise', maxAssets: -1, pricePerYear: 100 },
  }).catch(() => {});

  // Auto-activate FREE licence and seed onboarding progress for the first two steps
  // (user + licence — since we've captured the admin's name and picked a starter tier).
  await activateLicence(tenant.id, 'FREE', actorId);
  await prisma.onboardingProgress.upsert({
    where: { tenantId_step: { tenantId: tenant.id, step: 'licence_activation' } },
    update: { completed: true, completedAt: new Date(), completedBy: actorId, data: { tierName: 'FREE' } as never },
    create: {
      tenantId: tenant.id, step: 'licence_activation' as never, completed: true,
      completedAt: new Date(), completedBy: actorId, data: { tierName: 'FREE' } as never,
    },
  });
  await prisma.onboardingProgress.upsert({
    where: { tenantId_step: { tenantId: tenant.id, step: 'user_registration' } },
    update: { completed: true, completedAt: new Date(), completedBy: actorId, data: { name: user.name, email: user.email } as never },
    create: {
      tenantId: tenant.id, step: 'user_registration' as never, completed: true,
      completedAt: new Date(), completedBy: actorId, data: { name: user.name, email: user.email } as never,
    },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId,
      entityType: 'tenant',
      entityId: tenant.id,
      action: 'admin_tenant_created',
      metadata: { organisationName: tenantName, adminEmail: email, adminMode: input.adminMode },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  const result: AdminCreateTenantResult = {
    tenantId: tenant.id,
    userId: user.id,
    adminMode: input.adminMode,
  };

  if (input.adminMode === 'password') {
    result.temporaryPassword = plainPassword;
  } else {
    // Invite mode: try to email the temp password. Do not fail creation if SMTP is down —
    // return an error string so the UI can offer the admin the temp password as a fallback.
    try {
      await sendMail({
        to: email,
        subject: `You've been invited to ${tenantName} on Vairiot`,
        text:
          `Hi ${user.name},\n\n` +
          `A Vairiot platform administrator has created an account for you on the "${tenantName}" workspace.\n\n` +
          `Sign in with:\n` +
          `  Email:    ${email}\n` +
          `  Password: ${plainPassword}\n\n` +
          `You'll be asked to set your own password on first sign-in.\n\n` +
          `— The Vairiot team`,
        html:
          `<p>Hi ${escapeHtml(user.name)},</p>` +
          `<p>A Vairiot platform administrator has created an account for you on the <strong>${escapeHtml(tenantName)}</strong> workspace.</p>` +
          `<p>Sign in with:</p>` +
          `<ul>` +
            `<li><strong>Email:</strong> ${escapeHtml(email)}</li>` +
            `<li><strong>Temporary password:</strong> <code>${escapeHtml(plainPassword)}</code></li>` +
          `</ul>` +
          `<p>You'll be asked to set your own password on first sign-in.</p>` +
          `<p>— The Vairiot team</p>`,
      });
      result.inviteEmailSent = true;
    } catch (e) {
      const msg = (e as Error).message;
      logger.warn('admin_tenant_invite_email_failed', { tenantId: tenant.id, error: msg });
      result.inviteEmailSent = false;
      result.inviteEmailError = msg;
      // Fall back to returning the temp password so the admin can relay it manually.
      result.temporaryPassword = plainPassword;
    }
  }

  return result;
}

function generateTempPassword(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
