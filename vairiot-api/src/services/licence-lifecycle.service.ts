/**
 * Licence lifecycle: activate, renew, change duration, suspend, revoke and
 * reactivate.
 */
import {
  DEFAULT_GRACE_PERIOD_DAYS,
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_LICENCE_DURATION_MONTHS,
} from 'vairiot-shared';

import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import { generateLicenceNumber } from '../lib/licence-number';
import { prisma } from '../lib/prisma';

import { addMonths, auditLicenceEvent } from './licence-helpers';
import { getLicenceStatus, type LicenceStatusResult } from './licence-status.service';

// ─── Activate a licence (during onboarding) ──────────────────────────────────

export async function activateLicence(
  tenantId: string,
  tierName: string,
  actorId: string,
): Promise<LicenceStatusResult> {
  const tier = await prisma.licenceTier.findUnique({ where: { name: tierName as never } });
  if (!tier) throw new ValidationError(`Unknown licence tier: ${tierName}`);

  const existing = await prisma.licence.findFirst({
    where: { tenantId, status: { in: ['active', 'expiring'] } },
  });
  if (existing) throw new AppError(409, 'Tenant already has an active licence', 'LICENCE_EXISTS');

  const now = new Date();
  const durationMonths = DEFAULT_LICENCE_DURATION_MONTHS;
  const expiresAt = tier.isPerpetual
    ? null
    : addMonths(now, durationMonths);

  const licenceNumber = await generateLicenceNumber();
  const licence = await prisma.licence.create({
    data: {
      tenantId,
      tierId: tier.id,
      licenceNumber,
      status: 'active',
      durationMonths,
      activatedAt: now,
      expiresAt,
      gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS,
      expiryWarningDays: DEFAULT_EXPIRY_WARNING_DAYS,
      paymentConfirmed: tier.isPerpetual, // FREE tier is auto-confirmed
    },
  });

  await auditLicenceEvent(tenantId, actorId, licence.id, 'licence_activated', null, {
    tierName,
    durationMonths,
    expiresAt: expiresAt?.toISOString() ?? 'perpetual',
  });

  return getLicenceStatus(tenantId);
}

// ─── Renew (confirm payment) ─────────────────────────────────────────────────

export async function confirmPaymentAndRenew(
  licenceId: string,
  actorId: string,
  newDurationMonths?: number,
): Promise<LicenceStatusResult> {
  const licence = await prisma.licence.findUnique({
    where: { id: licenceId },
    include: { tier: true },
  });
  if (!licence) throw new NotFoundError('Licence not found');
  if (licence.tier.isPerpetual) throw new ValidationError('Perpetual licences do not require renewal');

  const now = new Date();
  const duration = newDurationMonths ?? licence.durationMonths;
  const baseDate = licence.expiresAt && licence.expiresAt > now
    ? licence.expiresAt  // extend from current expiry if still valid
    : now;               // renew from now if already expired
  const expiresAt = addMonths(baseDate, duration);

  const before = {
    status: licence.status,
    expiresAt: licence.expiresAt?.toISOString(),
    paymentConfirmed: licence.paymentConfirmed,
    durationMonths: licence.durationMonths,
  };

  await prisma.licence.update({
    where: { id: licenceId },
    data: {
      status: 'active',
      durationMonths: duration,
      expiresAt,
      paymentConfirmed: true,
      paymentConfirmedAt: now,
      paymentConfirmedBy: actorId,
    },
  });

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'payment_confirmed', before, {
    status: 'active',
    expiresAt: expiresAt.toISOString(),
    durationMonths: duration,
    paymentConfirmed: true,
  });

  return getLicenceStatus(licence.tenantId);
}

// ─── Change duration (Licensing Authority only) ──────────────────────────────

export async function changeDuration(
  licenceId: string,
  durationMonths: number,
  actorId: string,
): Promise<LicenceStatusResult> {
  if (durationMonths < 1 || durationMonths > 120) {
    throw new ValidationError('Duration must be between 1 and 120 months');
  }

  const licence = await prisma.licence.findUnique({
    where: { id: licenceId },
    include: { tier: true },
  });
  if (!licence) throw new NotFoundError('Licence not found');
  if (licence.tier.isPerpetual) throw new ValidationError('Cannot change duration on a perpetual licence');

  const before = { durationMonths: licence.durationMonths };

  // Recalculate expiry from activation date
  const expiresAt = licence.activatedAt
    ? addMonths(licence.activatedAt, durationMonths)
    : addMonths(new Date(), durationMonths);

  await prisma.licence.update({
    where: { id: licenceId },
    data: { durationMonths, expiresAt },
  });

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'duration_changed', before, {
    durationMonths,
    expiresAt: expiresAt.toISOString(),
  });

  return getLicenceStatus(licence.tenantId);
}

// ─── Suspend / Revoke ────────────────────────────────────────────────────────

export async function suspendLicence(
  licenceId: string,
  actorId: string,
  reason?: string,
): Promise<void> {
  const licence = await prisma.licence.findUnique({ where: { id: licenceId } });
  if (!licence) throw new NotFoundError('Licence not found');

  await prisma.licence.update({
    where: { id: licenceId },
    data: { status: 'suspended', suspendedAt: new Date(), suspendedBy: actorId },
  });

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'licence_suspended', null, { reason });
}

export async function revokeLicence(
  licenceId: string,
  actorId: string,
  reason?: string,
): Promise<void> {
  const licence = await prisma.licence.findUnique({ where: { id: licenceId } });
  if (!licence) throw new NotFoundError('Licence not found');

  await prisma.licence.update({
    where: { id: licenceId },
    data: { status: 'revoked', revokedAt: new Date(), revokedBy: actorId },
  });

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'licence_revoked', null, { reason });
}

export async function reactivateLicence(
  licenceId: string,
  actorId: string,
): Promise<LicenceStatusResult> {
  const licence = await prisma.licence.findUnique({ where: { id: licenceId } });
  if (!licence) throw new NotFoundError('Licence not found');
  if (licence.status !== 'suspended') throw new ValidationError('Only suspended licences can be reactivated');

  await prisma.licence.update({
    where: { id: licenceId },
    data: { status: 'active', suspendedAt: null, suspendedBy: null },
  });

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'licence_reactivated', null, null);
  return getLicenceStatus(licence.tenantId);
}
