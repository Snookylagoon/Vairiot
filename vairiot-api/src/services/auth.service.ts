import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import { checkAccountLock, recordLoginAttempt } from './login-protection.service';
import { touchDeviceOnLogin } from './licence.service';
import type { LoginRequest as LoginInput, AuthTokens } from 'vairiot-shared';
export type { LoginInput, AuthTokens };

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
  twoFactorUserId?: string;
}

export async function login(
  { email, password, tenantId }: LoginInput,
  ipAddress = '0.0.0.0',
  device?: DeviceCheckIn,
): Promise<LoginResult> {
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

  // If 2FA is enabled, return a challenge instead of tokens
  if (user.twoFactorEnabled) {
    await recordLoginAttempt(tenantId, email, ipAddress, true, user.id, 'awaiting_2fa');
    return { requiresTwoFactor: true, twoFactorUserId: user.id };
  }

  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  await recordLoginAttempt(tenantId, email, ipAddress, true, user.id);
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
  prisma.auditEvent.create({ data: { tenantId, actorId: user.id, entityType: 'user', entityId: user.id, action: 'login', metadata: { email } } }).catch((e) => logger.error('audit', { error: e }));
  if (device) await touchDeviceOnLogin(tenantId, user.id, device);
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' };
}
export async function loginWithTwoFactor(
  userId: string,
  twoFactorToken: string,
  ipAddress = '0.0.0.0',
  device?: DeviceCheckIn,
): Promise<LoginResult> {
  const { validateTwoFactorToken } = await import('./two-factor.service');
  await validateTwoFactorToken(userId, twoFactorToken);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.active) throw new UnauthorizedError('User not found or inactive');

  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
  prisma.auditEvent.create({ data: { tenantId: user.tenantId, actorId: user.id, entityType: 'user', entityId: user.id, action: 'login_2fa', metadata: { email: user.email } } }).catch((e) => logger.error('audit', { error: e }));
  if (device) await touchDeviceOnLogin(user.tenantId, user.id, device);
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' };
}

export async function refreshTokens(token: string): Promise<AuthTokens> {
  const p = verifyRefreshToken(token);
  const user = await prisma.user.findUnique({ where: { id: p.sub }, include: { roles: { include: { role: true } } } });
  if (!user || !user.active) throw new UnauthorizedError('Invalid or expired refresh token');
  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  return {
    accessToken:  signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions }),
    refreshToken: signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' }),
    expiresIn: process.env.JWT_EXPIRY ?? '8h',
  };
}
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
