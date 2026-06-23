import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { NotFoundError } from '../lib/errors';
import { buildOrderBy } from '../lib/sort';

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
