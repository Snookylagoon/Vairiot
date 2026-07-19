import { ALL_PERMISSIONS } from 'vairiot-shared';

import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { prisma } from '../lib/prisma';

interface UserWithRoles {
  roles: { role: { permissions: string[] } }[];
}

export interface PermissionOverrideInput {
  permission: string;
  granted: boolean;
}

export interface OverrideRow {
  permission: string;
  granted: boolean;
}

export interface EffectivePermissionsView {
  userId: string;
  rolePermissions: string[];
  overrides: OverrideRow[];
  effective: string[];
}

const VALID_PERMISSIONS = new Set<string>(ALL_PERMISSIONS as readonly string[]);

/** Merge role-derived permissions with per-user overrides into the effective set. */
export function applyOverrides(
  rolePermissions: string[],
  overrides: { permission: string; granted: boolean }[],
): string[] {
  const set = new Set(rolePermissions);
  for (const o of overrides) {
    if (o.granted) set.add(o.permission);
    else set.delete(o.permission);
  }
  return Array.from(set);
}

/** Compute effective permissions for a user object that already has roles loaded. */
export async function effectivePermissionsForUser(userId: string, user: UserWithRoles): Promise<string[]> {
  const rolePerms = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId },
    select: { permission: true, granted: true },
  });
  return applyOverrides(rolePerms, overrides);
}

/** Return the matrix view (role perms, overrides, effective) for UI use. */
export async function getUserPermissionsView(
  userId: string,
  tenantScope?: string,
): Promise<EffectivePermissionsView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  if (tenantScope && user.tenantId !== tenantScope) {
    throw new ForbiddenError('Cannot view a user in another tenant');
  }

  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId },
    select: { permission: true, granted: true },
  });
  const rolePermissions = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  const effective = applyOverrides(rolePermissions, overrides);

  return { userId, rolePermissions, overrides, effective };
}

/**
 * Replace the override set for a user.
 *
 * For each entry in `overrides`:
 *   - granted=true  but role already grants it → store nothing (it's the default).
 *   - granted=false but role doesn't grant it  → store nothing (it's the default).
 *   - otherwise store the row (it diverges from the role default).
 *
 * Any existing override not present in the new list is removed (reverts to role default).
 */
export async function setUserPermissionOverrides(
  userId: string,
  actorId: string,
  overrides: PermissionOverrideInput[],
  tenantScope?: string,
): Promise<EffectivePermissionsView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  if (tenantScope && user.tenantId !== tenantScope) {
    throw new ForbiddenError('Cannot modify a user in another tenant');
  }

  for (const o of overrides) {
    if (typeof o.permission !== 'string' || typeof o.granted !== 'boolean') {
      throw new ValidationError('Each override must be { permission: string, granted: boolean }');
    }
    if (!VALID_PERMISSIONS.has(o.permission)) {
      throw new ValidationError(`Unknown permission: ${o.permission}`);
    }
  }

  const rolePerms = new Set(user.roles.flatMap((ur) => ur.role.permissions));
  const meaningful = overrides.filter((o) => rolePerms.has(o.permission) !== o.granted);

  const before = await prisma.userPermissionOverride.findMany({ where: { userId } });

  await prisma.$transaction([
    prisma.userPermissionOverride.deleteMany({ where: { userId } }),
    ...(meaningful.length > 0
      ? [prisma.userPermissionOverride.createMany({
          data: meaningful.map((o) => ({ userId, permission: o.permission, granted: o.granted, grantedBy: actorId })),
        })]
      : []),
  ]);

  await prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId,
      entityType: 'user',
      entityId: userId,
      action: 'permission_overrides_set',
      before: { overrides: before.map((b) => ({ permission: b.permission, granted: b.granted })) },
      after:  { overrides: meaningful.map((o) => ({ permission: o.permission, granted: o.granted })) },
    },
  }).catch(() => undefined);

  return getUserPermissionsView(userId);
}
