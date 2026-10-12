import { UnauthorizedError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATIONS_MINUTES = [1, 5, 15, 30, 60]; // progressive

export async function checkAccountLock(tenantId: string, email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
    select: { lockedUntil: true },
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000,
    );
    throw new UnauthorizedError(
      `Account is locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
      'ACCOUNT_LOCKED',
    );
  }
}

export async function recordLoginAttempt(
  tenantId: string,
  email: string,
  ipAddress: string,
  success: boolean,
  userId?: string,
  reason?: string,
): Promise<void> {
  // Awaited, but a failed write is only logged: it must never fail the login.
  // These used to be fire-and-forget, which left them in flight after the
  // response. Every caller awaits this function anyway, and test teardown that
  // deletes the user would otherwise race the insert.
  await prisma.loginAttempt.create({
    data: { userId, email, ipAddress, success, reason },
  }).catch((e) => logger.error('Login attempt write failed', { error: e.message }));

  if (success && userId) {
    // Reset counter on successful login
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    }).catch((e) => logger.error('Failed to reset login counter', { error: e.message }));
    return;
  }

  if (!userId) return; // user not found — nothing to lock

  // Increment failed count and potentially lock
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true },
  });
  if (!user) return;

  const newCount = user.failedLoginCount + 1;

  if (newCount >= MAX_FAILED_ATTEMPTS) {
    const lockIndex = Math.min(
      Math.floor((newCount - MAX_FAILED_ATTEMPTS) / MAX_FAILED_ATTEMPTS),
      LOCKOUT_DURATIONS_MINUTES.length - 1,
    );
    const lockMinutes = LOCKOUT_DURATIONS_MINUTES[lockIndex];
    const lockedUntil = new Date(Date.now() + lockMinutes * 60000);

    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: newCount, lockedUntil },
    });

    logger.warn('Account locked due to repeated failures', {
      userId, email, failedCount: newCount, lockMinutes,
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: newCount },
    });
  }
}
