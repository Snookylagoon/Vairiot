import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, signSetupToken, signChallengeToken, verifyChallengeToken, verifyRefreshToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { blacklistToken, isTokenBlacklisted } from '../lib/redis';
import { UnauthorizedError, ValidationError, NotFoundError } from '../lib/errors';
import { checkAccountLock, recordLoginAttempt } from './login-protection.service';
import { touchDeviceOnLogin } from './licence.service';
import { effectivePermissionsForUser } from './user-permissions.service';
import { validatePasswordPolicy } from './password-policy.service';
import { ROLES_REQUIRING_2FA, type RoleName } from 'vairiot-shared';
import type { LoginRequest as LoginInput, AuthTokens } from 'vairiot-shared';
export type { LoginInput, AuthTokens };

function rolesRequire2FA(roles: string[]): boolean {
  return roles.some((r) => ROLES_REQUIRING_2FA.includes(r as RoleName));
}

export interface DeviceCheckIn {
  fingerprint: string;
  deviceName:  string;
  deviceType?: string;
}

export interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  requiresTwoFactor?: boolean;
  twoFactorChallengeToken?: string;
  requiresPasswordChange?: boolean;
  passwordChangeToken?: string;
  requiresTwoFactorSetup?: boolean;
  twoFactorSetupToken?: string;
  /** @deprecated use twoFactorChallengeToken */
  twoFactorUserId?: string;
}

async function resolveTenantId(input: string): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { id: input }, select: { id: true } });
  if (existing) return existing.id;
  const byName = await prisma.tenant.findUnique({ where: { name: input }, select: { id: true } });
  if (byName) return byName.id;
  const byNameInsensitive = await prisma.tenant.findFirst({
    where: { name: { equals: input, mode: 'insensitive' } },
    select: { id: true },
  });
  return byNameInsensitive?.id ?? input;
}

export async function login(
  { email, password, tenantId: rawTenantId }: LoginInput,
  ipAddress = '0.0.0.0',
  device?: DeviceCheckIn,
): Promise<LoginResult> {
  const tenantId = await resolveTenantId(rawTenantId);

  // Check lockout before anything else
  await checkAccountLock(tenantId, email);

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.active) {
    await bcrypt.compare(password, '$2b$12$LRrFB3HlpUGi3as4IuSJKuBIURsOQKzkxmBiCO3bHFbvBYuCfmXty').catch(() => false);
    await recordLoginAttempt(tenantId, email, ipAddress, false, undefined, 'user_not_found');
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.passwordHash) throw new ValidationError('This account uses single sign-on');
  if (!await bcrypt.compare(password, user.passwordHash)) {
    await recordLoginAttempt(tenantId, email, ipAddress, false, user.id, 'wrong_password');
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // If a forced password change is pending, return a challenge before tokens or 2FA
  if (user.mustChangePassword) {
    await recordLoginAttempt(tenantId, email, ipAddress, true, user.id, 'awaiting_password_change');
    const passwordChangeToken = signChallengeToken({ sub: user.id, tenantId: user.tenantId, scope: 'password_change' });
    return { requiresPasswordChange: true, passwordChangeToken };
  }

  // If 2FA is enabled, return a challenge instead of tokens
  if (user.twoFactorEnabled) {
    await recordLoginAttempt(tenantId, email, ipAddress, true, user.id, 'awaiting_2fa');
    const twoFactorChallengeToken = signChallengeToken({ sub: user.id, tenantId: user.tenantId, scope: '2fa_challenge' });
    return { requiresTwoFactor: true, twoFactorChallengeToken };
  }

  const roles       = user.roles.map((ur) => ur.role.name);

  // Force 2FA enrolment if the user's role mandates it and they haven't set it up.
  if (rolesRequire2FA(roles)) {
    await recordLoginAttempt(tenantId, email, ipAddress, true, user.id, 'awaiting_2fa_setup');
    const setupToken = signSetupToken({ sub: user.id, tenantId: user.tenantId, email: user.email });
    return { requiresTwoFactorSetup: true, twoFactorSetupToken: setupToken };
  }

  const permissions = await effectivePermissionsForUser(user.id, user);
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  await recordLoginAttempt(tenantId, email, ipAddress, true, user.id);
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
  prisma.auditEvent.create({ data: { tenantId, actorId: user.id, entityType: 'user', entityId: user.id, action: 'login', metadata: { email } } }).catch((e) => logger.error('audit', { error: e }));
  if (device) await touchDeviceOnLogin(tenantId, user.id, device);
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' };
}
export async function loginWithTwoFactor(
  challengeToken: string,
  twoFactorCode: string,
  ipAddress = '0.0.0.0',
  device?: DeviceCheckIn,
): Promise<LoginResult> {
  let payload;
  try { payload = verifyChallengeToken(challengeToken, '2fa_challenge'); }
  catch { throw new UnauthorizedError('2FA session expired — please sign in again'); }

  const { validateTwoFactorToken } = await import('./two-factor.service');
  await validateTwoFactorToken(payload.sub, twoFactorCode);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.active) throw new UnauthorizedError('User not found or inactive');

  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = await effectivePermissionsForUser(user.id, user);
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
  prisma.auditEvent.create({ data: { tenantId: user.tenantId, actorId: user.id, entityType: 'user', entityId: user.id, action: 'login_2fa', metadata: { email: user.email } } }).catch((e) => logger.error('audit', { error: e }));
  if (device) await touchDeviceOnLogin(user.tenantId, user.id, device);
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' };
}

export async function refreshTokens(token: string): Promise<AuthTokens> {
  const p = verifyRefreshToken(token);

  // Rotation with reuse detection: the presented refresh token is single-use.
  // If it has already been rotated (its jti is blacklisted), someone is replaying
  // a stolen token — reject. Otherwise, blacklist it now so it can't be used again.
  if (p.jti) {
    if (await isTokenBlacklisted(p.jti)) {
      logger.warn('Refresh token reuse detected', { sub: p.sub, jti: p.jti });
      throw new UnauthorizedError('Refresh token already used — please sign in again', 'TOKEN_REUSED');
    }
    const ttl = p.exp ? p.exp - Math.floor(Date.now() / 1000) : 0;
    if (ttl > 0) await blacklistToken(p.jti, ttl);
  }

  const user = await prisma.user.findUnique({ where: { id: p.sub }, include: { roles: { include: { role: true } } } });
  if (!user || !user.active) throw new UnauthorizedError('Invalid or expired refresh token');
  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = await effectivePermissionsForUser(user.id, user);
  return {
    accessToken:  signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions }),
    refreshToken: signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' }),
    expiresIn: process.env.JWT_EXPIRY ?? '8h',
  };
}
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

/**
 * Change the password for an already-authenticated user.
 * Verifies current password, enforces policy, clears mustChangePassword.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new UnauthorizedError('User not found or inactive');
  if (!user.passwordHash) throw new ValidationError('This account does not have a password');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from the current password');
  }
  validatePasswordPolicy(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'password_change',
      metadata: { email: user.email },
    },
  }).catch((e) => logger.error('audit', { error: e }));
  return { message: 'Password updated' };
}

/**
 * Complete a forced password change after login challenge.
 * Verifies current (temp) password, enforces policy, clears flag, returns tokens.
 */
export async function completeForcedPasswordChange(
  challengeToken: string,
  currentPassword: string,
  newPassword: string,
  ipAddress = '0.0.0.0',
  device?: DeviceCheckIn,
): Promise<LoginResult> {
  let payload;
  try { payload = verifyChallengeToken(challengeToken, 'password_change'); }
  catch { throw new UnauthorizedError('Password change session expired — please sign in again'); }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.active) throw new NotFoundError('User not found');
  if (!user.mustChangePassword) {
    throw new ValidationError('No forced password change is pending for this user');
  }
  if (!user.passwordHash) throw new ValidationError('This account does not have a password');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await recordLoginAttempt(user.tenantId, user.email, ipAddress, false, user.id, 'forced_change_wrong_current');
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from the current password');
  }
  validatePasswordPolicy(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  // If 2FA is enabled, return the 2FA challenge instead of tokens
  if (user.twoFactorEnabled) {
    await recordLoginAttempt(user.tenantId, user.email, ipAddress, true, user.id, 'awaiting_2fa');
    const twoFactorChallengeToken = signChallengeToken({ sub: user.id, tenantId: user.tenantId, scope: '2fa_challenge' });
    return { requiresTwoFactor: true, twoFactorChallengeToken };
  }

  // 2FA is optional — issue tokens directly once the forced change is complete.
  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = await effectivePermissionsForUser(user.id, user);
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  await recordLoginAttempt(user.tenantId, user.email, ipAddress, true, user.id, 'password_change_complete');
  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'password_change_forced',
      metadata: { email: user.email },
    },
  }).catch((e) => logger.error('audit', { error: e }));
  if (device) await touchDeviceOnLogin(user.tenantId, user.id, device);
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' };
}
