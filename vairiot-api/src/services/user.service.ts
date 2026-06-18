import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

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
  data: { email: string; name: string; password: string; roleId?: string },
) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email: data.email } });
  if (existing) throw new Error('EMAIL_EXISTS');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { tenantId, email: data.email, name: data.name, passwordHash, active: true },
  });
  if (data.roleId) {
    const role = await prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
    if (!role) throw new Error('ROLE_NOT_FOUND');
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, name: true, active: true, createdAt: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
    },
  });
}

export async function setUserActive(tenantId: string, userId: string, active: boolean) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new Error('NOT_FOUND');
  return prisma.user.update({ where: { id: userId }, data: { active }, select: { id: true, active: true } });
}

export async function setUserRole(tenantId: string, userId: string, roleId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new Error('NOT_FOUND');
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) throw new Error('ROLE_NOT_FOUND');
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.userRole.create({ data: { userId, roleId } });
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, active: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
    },
  });
}
