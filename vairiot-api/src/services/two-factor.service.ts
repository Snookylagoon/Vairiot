import { generateSecret, generateURI, verifySync, TOTP } from 'otplib';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ValidationError, NotFoundError, AppError } from '../lib/errors';
import { ROLES_REQUIRING_2FA, type RoleName } from 'vairiot-shared';

const BACKUP_CODE_COUNT = 8;
const ISSUER = 'Vairiot';

// ─── Setup: generate secret + QR data ────────────────────────────────────────

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export async function generateTwoFactorSetup(userId: string, email: string): Promise<TwoFactorSetup> {
  const existing = await prisma.userTwoFactor.findUnique({ where: { userId } });
  if (existing?.verifiedAt) {
    throw new AppError(409, 'Two-factor authentication is already enabled', 'TWO_FA_ALREADY_ENABLED');
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });
  const backupCodes = generateBackupCodes();

  await prisma.userTwoFactor.upsert({
    where: { userId },
    update: { secret, backupCodes, verifiedAt: null },
    create: { userId, secret, backupCodes },
  });

  return { secret, otpauthUrl, backupCodes };
}

// ─── Verify: confirm TOTP token to activate 2FA ─────────────────────────────

export async function verifyAndEnableTwoFactor(userId: string, token: string): Promise<boolean> {
  const record = await prisma.userTwoFactor.findUnique({ where: { userId } });
  if (!record) throw new NotFoundError('Two-factor setup not found — call setup first');

  const isValid = verifySync({ token, secret: record.secret });
  if (!isValid) throw new ValidationError('Invalid verification code');

  await prisma.userTwoFactor.update({
    where: { userId },
    data: { verifiedAt: new Date() },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });

  await auditTwoFactor(userId, 'two_factor_enabled');

  return true;
}

// ─── Validate: check TOTP during login ───────────────────────────────────────

export async function validateTwoFactorToken(userId: string, token: string): Promise<boolean> {
  const record = await prisma.userTwoFactor.findUnique({ where: { userId } });
  if (!record || !record.verifiedAt) {
    throw new ValidationError('Two-factor authentication is not enabled');
  }

  // Check TOTP first
  if (verifySync({ token, secret: record.secret })) {
    return true;
  }

  // Check backup codes
  const codeIndex = record.backupCodes.indexOf(token);
  if (codeIndex >= 0) {
    // Consume the backup code
    const remaining = [...record.backupCodes];
    remaining.splice(codeIndex, 1);
    await prisma.userTwoFactor.update({
      where: { userId },
      data: { backupCodes: remaining },
    });
    await auditTwoFactor(userId, 'backup_code_used', { codesRemaining: remaining.length });
    return true;
  }

  throw new ValidationError('Invalid two-factor code');
}

// ─── Disable 2FA ─────────────────────────────────────────────────────────────

export async function disableTwoFactor(userId: string, roles: string[]): Promise<void> {
  // Block disabling for roles that require 2FA
  const requiresMandatory = roles.some((r) =>
    ROLES_REQUIRING_2FA.includes(r as RoleName),
  );
  if (requiresMandatory) {
    throw new AppError(
      403,
      'Two-factor authentication is mandatory for your role and cannot be disabled',
      'TWO_FA_MANDATORY',
    );
  }

  await prisma.userTwoFactor.delete({ where: { userId } }).catch(() => {});
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false },
  });

  await auditTwoFactor(userId, 'two_factor_disabled');
}

// ─── Check if 2FA is required but not set up ─────────────────────────────────

export async function checkTwoFactorRequirement(userId: string, roles: string[]): Promise<{
  required: boolean;
  enabled: boolean;
  needsSetup: boolean;
}> {
  const required = roles.some((r) =>
    ROLES_REQUIRING_2FA.includes(r as RoleName),
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  const enabled = user?.twoFactorEnabled ?? false;

  return { required, enabled, needsSetup: required && !enabled };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

async function auditTwoFactor(userId: string, action: string, metadata?: unknown): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (!user) return;

  prisma.auditEvent.create({
    data: {
      tenantId: user.tenantId,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      action,
      metadata: metadata as never,
    },
  }).catch((e) => logger.error('Audit event write failed', { error: e.message }));
}
