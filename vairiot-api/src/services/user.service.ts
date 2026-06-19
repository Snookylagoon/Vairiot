import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { recordAuditEvent } from './audit-event.service';
import { NotFoundError, ConflictError } from '../lib/errors';
import { validatePasswordPolicy } from './password-policy.service';
import { enqueueUserInvite } from '../lib/queue';

const INVITE_EXPIRY_HOURS = 48;

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
  data: { email: string; name: string; roleId?: string },
) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email: data.email } });
  if (existing) throw new ConflictError('A user with that email already exists', 'EMAIL_EXISTS');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: { tenantId, email: data.email, name: data.name, active: false },
  });

  await prisma.userInvitation.create({
    data: { tenantId, userId: user.id, token, expiresAt, createdBy: actor },
  });

  let roleName: string | undefined;
  if (data.roleId) {
    const role = await prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
    if (!role) throw new NotFoundError('Role not found');
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    roleName = role.name;
  }

  const inviter = await prisma.user.findUnique({ where: { id: actor }, select: { name: true } });
  await enqueueUserInvite({
    tenantId,
    recipientEmail: data.email,
    recipientName: data.name,
    inviteToken: token,
    inviterName: inviter?.name,
  });

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

export async function acceptInvite(token: string, password: string) {
  const invitation = await prisma.userInvitation.findUnique({ where: { token } });
  if (!invitation) throw new NotFoundError('Invalid or expired invitation');
  if (invitation.accepted) throw new ConflictError('This invitation has already been used', 'INVITE_USED');
  if (invitation.expiresAt < new Date()) throw new ConflictError('This invitation has expired', 'INVITE_EXPIRED');

  validatePasswordPolicy(password);
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invitation.userId },
      data: { passwordHash, active: true },
    }),
    prisma.userInvitation.update({
      where: { id: invitation.id },
      data: { accepted: true, acceptedAt: new Date() },
    }),
  ]);

  recordAuditEvent({
    tenantId: invitation.tenantId,
    actor: invitation.userId,
    entityType: 'user',
    entityId: invitation.userId,
    action: 'invite-accepted',
    after: { accepted: true },
  });

  return { message: 'Account activated. You can now log in.' };
}

export async function resendInvite(tenantId: string, actor: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new NotFoundError('User not found');
  if (user.active && user.passwordHash) throw new ConflictError('User has already activated their account', 'ALREADY_ACTIVE');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.userInvitation.updateMany({
    where: { userId, accepted: false },
    data: { expiresAt: new Date(0) },
  });

  await prisma.userInvitation.create({
    data: { tenantId, userId, token, expiresAt, createdBy: actor },
  });

  const inviter = await prisma.user.findUnique({ where: { id: actor }, select: { name: true } });
  await enqueueUserInvite({
    tenantId,
    recipientEmail: user.email,
    recipientName: user.name,
    inviteToken: token,
    inviterName: inviter?.name,
  });

  recordAuditEvent({
    tenantId, actor,
    entityType: 'user', entityId: userId, action: 'invite-resend',
    metadata: { email: user.email },
  });

  return { message: 'Invitation resent' };
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
