import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { recordAuditEvent } from './audit-event.service';
import { NotFoundError, ConflictError } from '../lib/errors';

export async function listUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
    },
  });
}

export async function listRoles(tenantId: string) {
  return prisma.role.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, permissions: true, isSystem: true },
  });
}

export async function inviteUser(
  tenantId: string,
  actor: string,
  data: { email: string; name: string; password: string; roleId?: string },
) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email: data.email } });
  if (existing) throw new ConflictError('A user with that email already exists', 'EMAIL_EXISTS');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { tenantId, email: data.email, name: data.name, passwordHash, active: true },
  });
  let roleName: string | undefined;
  if (data.roleId) {
    const role = await prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
    if (!role) throw new NotFoundError('Role not found');
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    roleName = role.name;
  }
  recordAuditEvent({
    tenantId, actor,
    entityType: 'user', entityId: user.id, action: 'invite',
    after: { email: user.email, name: user.name, role: roleName ?? null },
  });
  return prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, name: true, active: true, createdAt: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
    },
  });
}

export async function setUserActive(tenantId: string, actor: string, userId: string, active: boolean) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new NotFoundError('User not found');
  const updated = await prisma.user.update({
    where: { id: userId }, data: { active },
    select: { id: true, active: true },
  });
  if (user.active !== active) {
    recordAuditEvent({
      tenantId, actor,
      entityType: 'user', entityId: userId, action: active ? 'enable' : 'disable',
      before: { active: user.active }, after: { active },
      metadata: { email: user.email },
    });
  }
  return updated;
}

export async function setUserRole(tenantId: string, actor: string, userId: string, roleId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { roles: { include: { role: { select: { id: true, name: true } } } } },
  });
  if (!user) throw new NotFoundError('User not found');
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) throw new NotFoundError('Role not found');
  const previous = user.roles.map((ur) => ur.role.name);
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.userRole.create({ data: { userId, roleId } });
  recordAuditEvent({
    tenantId, actor,
    entityType: 'user', entityId: userId, action: 'role-change',
    before: { roles: previous }, after: { roles: [role.name] },
    metadata: { email: user.email },
  });
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, active: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
    },
  });
}
