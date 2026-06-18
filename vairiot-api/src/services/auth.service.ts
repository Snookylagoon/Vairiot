import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import type { LoginRequest as LoginInput, AuthTokens } from 'vairiot-shared';
export type { LoginInput, AuthTokens };
export async function login({ email, password, tenantId }: LoginInput): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.active) {
    await bcrypt.compare(password, '$2b$12$LRrFB3HlpUGi3as4IuSJKuBIURsOQKzkxmBiCO3bHFbvBYuCfmXty').catch(() => false);
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.passwordHash) throw new ValidationError('This account uses single sign-on');
  if (!await bcrypt.compare(password, user.passwordHash)) throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  const roles       = user.roles.map((ur) => ur.role.name);
  const permissions = Array.from(new Set(user.roles.flatMap((ur) => ur.role.permissions)));
  const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
  prisma.auditEvent.create({ data: { tenantId, actorId: user.id, entityType: 'user', entityId: user.id, action: 'login', metadata: { email } } }).catch((e) => logger.error('audit', { error: e }));
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
