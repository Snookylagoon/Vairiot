import { ROLES_REQUIRING_2FA, TWO_FA_GRACE_DAYS_DEFAULT } from 'vairiot-shared';

import { prisma } from '../lib/prisma';

// Mandatory two-factor for administrators with a grace period (decision D6,
// stage 1.18). The clock starts at the first sign-in after the rule applies.

const DAY_MS = 24 * 3600 * 1000;

export function graceDays(): number {
  const n = Number(process.env.TWO_FA_GRACE_DAYS);
  return process.env.TWO_FA_GRACE_DAYS !== undefined && Number.isFinite(n) && n >= 0 ? n : TWO_FA_GRACE_DAYS_DEFAULT;
}

export function rolesRequireTwoFactor(roles: string[]): boolean {
  return roles.some((r) => ROLES_REQUIRING_2FA.includes(r));
}

/** When enrolment is due for a user who must enrol; starts the clock if it has not started. */
export async function startOrReadGrace(user: { id: string; twoFactorGraceStartedAt: Date | null }, now = new Date()) {
  let start = user.twoFactorGraceStartedAt;
  if (!start) {
    start = now;
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorGraceStartedAt: start } });
  }
  const dueBy = new Date(start.getTime() + graceDays() * DAY_MS);
  return { dueBy, expired: now.getTime() >= dueBy.getTime() };
}

/** For /auth/me: the due date if this user still has to enrol, else null. Never starts the clock. */
export async function twoFactorSetupDueBy(userId: string, roles: string[]): Promise<string | null> {
  if (!rolesRequireTwoFactor(roles)) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorGraceStartedAt: true } });
  if (!user || user.twoFactorEnabled || !user.twoFactorGraceStartedAt) return null;
  return new Date(user.twoFactorGraceStartedAt.getTime() + graceDays() * DAY_MS).toISOString();
}
