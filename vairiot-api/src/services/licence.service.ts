import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { generateLicenceNumber } from '../lib/licence-number';
import { buildOrderBy } from '../lib/sort';
import {
  DEFAULT_GRACE_PERIOD_DAYS,
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_LICENCE_DURATION_MONTHS,
} from 'vairiot-shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LicenceStatusResult {
  licenceId: string;
  licenceNumber: string;
  tierName: string;
  tierDisplayName: string;
  status: string;
  durationMonths: number;
  activatedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  gracePeriodDays: number;
  expiryWarningDays: number;
  paymentConfirmed: boolean;
  assetCap: number;
  assetCount: number;
  deviceAllowance: number;
  deviceCount: number;
}

// ─── Deployment mode ─────────────────────────────────────────────────────────

function getDeploymentMode(): string {
  return process.env.DEPLOYMENT_MODE ?? 'standalone';
}

// ─── Core: get current licence status ────────────────────────────────────────

export async function getLicenceStatus(tenantId: string): Promise<LicenceStatusResult> {
  const licence = await prisma.licence.findFirst({
    where: { tenantId, status: { notIn: ['revoked'] } },
    orderBy: { createdAt: 'desc' },
    include: { tier: true, deviceSlots: true },
  });

  if (!licence) {
    throw new NotFoundError('No licence found for this tenant');
  }

  const tenantIds = await getTenantFamily(tenantId);

  const assetCount = await prisma.asset.count({
    where: { tenantId: { in: tenantIds }, deletedAt: null },
  });

  const deviceCount = await prisma.device.count({
    where: { tenantId, active: true },
  });

  const deviceAllowance = licence.tier.baseDevices + licence.deviceSlots.length;

  let daysRemaining: number | null = null;
  if (licence.expiresAt) {
    daysRemaining = Math.max(
      0,
      Math.ceil((licence.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
  }

  // Re-evaluate status based on current date
  const computedStatus = computeStatus(licence);
  if (computedStatus !== licence.status) {
    await prisma.licence.update({
      where: { id: licence.id },
      data: { status: computedStatus },
    });
  }

  return {
    licenceId: licence.id,
    licenceNumber: licence.licenceNumber,
    tierName: licence.tier.name,
    tierDisplayName: licence.tier.displayName,
    status: computedStatus,
    durationMonths: licence.durationMonths,
    activatedAt: licence.activatedAt?.toISOString() ?? null,
    expiresAt: licence.expiresAt?.toISOString() ?? null,
    daysRemaining,
    gracePeriodDays: licence.gracePeriodDays,
    expiryWarningDays: licence.expiryWarningDays,
    paymentConfirmed: licence.paymentConfirmed,
    assetCap: licence.tier.maxAssets,
    assetCount,
    deviceAllowance,
    deviceCount,
  };
}

type LicenceStatusEnum = 'active' | 'expiring' | 'expired' | 'suspended' | 'revoked';

function computeStatus(licence: {
  status: string;
  expiresAt: Date | null;
  gracePeriodDays: number;
  expiryWarningDays: number;
}): LicenceStatusEnum {
  if (licence.status === 'suspended' || licence.status === 'revoked') {
    return licence.status as LicenceStatusEnum;
  }
  if (!licence.expiresAt) return 'active';

  const now = Date.now();
  const expiresAt = licence.expiresAt.getTime();
  const warningAt = expiresAt - licence.expiryWarningDays * 24 * 60 * 60 * 1000;
  const graceEnd = expiresAt + licence.gracePeriodDays * 24 * 60 * 60 * 1000;

  if (now > graceEnd) return 'expired';
  if (now > expiresAt) return 'expired';
  if (now > warningAt) return 'expiring';
  return 'active';
}

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

// ─── Device management ───────────────────────────────────────────────────────

export async function addDeviceSlot(
  licenceId: string,
  actorId: string,
): Promise<{ slotId: string; totalAllowance: number }> {
  const licence = await prisma.licence.findUnique({
    where: { id: licenceId },
    include: { tier: true, deviceSlots: true },
  });
  if (!licence) throw new NotFoundError('Licence not found');

  const slot = await prisma.deviceSlot.create({
    data: {
      licenceId,
      addedBy: actorId,
      paidAmount: licence.tier.pricePerDevice,
    },
  });

  const totalAllowance = licence.tier.baseDevices + licence.deviceSlots.length + 1;

  await auditLicenceEvent(licence.tenantId, actorId, licenceId, 'device_slot_added', null, {
    slotId: slot.id,
    totalAllowance,
    paidAmount: Number(licence.tier.pricePerDevice),
  });

  return { slotId: slot.id, totalAllowance };
}

export async function registerDevice(
  tenantId: string,
  data: {
    deviceName: string;
    deviceType?: string;
    serialNumber?: string;
    hardwareId?: string;
    fingerprint?: string;
    userId?: string;
  },
  actorId: string,
): Promise<{ deviceId: string; active: boolean; reused: boolean }> {
  const fingerprint = data.fingerprint?.trim() || null;

  // If we have a fingerprint, try to reuse the existing row for this tenant.
  if (fingerprint) {
    const existing = await prisma.device.findUnique({
      where: { tenantId_fingerprint: { tenantId, fingerprint } },
    });
    if (existing) {
      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: {
          deviceName: data.deviceName,
          deviceType: data.deviceType ?? existing.deviceType,
          serialNumber: data.serialNumber ?? existing.serialNumber,
          hardwareId: data.hardwareId ?? existing.hardwareId,
          userId: data.userId ?? existing.userId,
          lastSeenAt: new Date(),
        },
      });
      return { deviceId: updated.id, active: updated.active, reused: true };
    }

    // Fingerprint changed (e.g. app reinstall, ANDROID_ID reset) but same
    // physical device. Match on deviceName + userId and adopt the new fingerprint,
    // deactivating the stale row's old fingerprint in the process.
    if (data.userId) {
      const stale = await prisma.device.findFirst({
        where: { tenantId, deviceName: data.deviceName, userId: data.userId },
      });
      if (stale) {
        const updated = await prisma.device.update({
          where: { id: stale.id },
          data: {
            fingerprint,
            deviceType: data.deviceType ?? stale.deviceType,
            serialNumber: data.serialNumber ?? stale.serialNumber,
            hardwareId: data.hardwareId ?? stale.hardwareId,
            lastSeenAt: new Date(),
          },
        });
        return { deviceId: updated.id, active: updated.active, reused: true };
      }
    }
  }

  // New device — check allowance and decide activation.
  const licence = await prisma.licence.findFirst({
    where: { tenantId, status: { in: ['active', 'expiring'] } },
    include: { tier: true, deviceSlots: true },
  });

  const activeDevices = await prisma.device.count({ where: { tenantId, active: true } });
  const allowance = licence
    ? licence.tier.baseDevices + licence.deviceSlots.length
    : 1;

  const canActivate = activeDevices < allowance;
  const now = new Date();

  const device = await prisma.device.create({
    data: {
      tenantId,
      deviceName: data.deviceName,
      deviceType: data.deviceType ?? 'handheld',
      serialNumber: data.serialNumber,
      hardwareId: data.hardwareId,
      fingerprint,
      userId: data.userId,
      licenceId: licence?.id,
      active: canActivate,
      activatedAt: canActivate ? now : null,
      lastSeenAt: now,
    },
  });

  await auditLicenceEvent(tenantId, actorId, device.id, 'device_registered', null, {
    deviceName: data.deviceName,
    activated: canActivate,
    activeDevices: activeDevices + (canActivate ? 1 : 0),
    allowance,
  });

  return { deviceId: device.id, active: canActivate, reused: false };
}

/**
 * Best-effort device check-in on login. Never throws — login must succeed
 * even if registration fails (database hiccup, missing fields, etc.).
 */
export async function touchDeviceOnLogin(
  tenantId: string,
  userId: string,
  device: { fingerprint: string; deviceName: string; deviceType?: string } | undefined,
): Promise<void> {
  if (!device?.fingerprint || !device.deviceName) return;
  try {
    await registerDevice(
      tenantId,
      {
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        fingerprint: device.fingerprint,
        userId,
      },
      userId,
    );
  } catch (e) {
    logger.warn('touchDeviceOnLogin failed', {
      tenantId,
      userId,
      error: (e as Error).message,
    });
  }
}

export async function deactivateDevice(
  deviceId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new NotFoundError('Device not found');
  if (device.tenantId !== tenantId) throw new ForbiddenError('Device does not belong to this tenant');
  if (!device.active) throw new ValidationError('Device is already inactive');

  await prisma.device.update({
    where: { id: deviceId },
    data: { active: false, activatedAt: null },
  });

  await auditLicenceEvent(tenantId, actorId, deviceId, 'device_deactivated', {
    active: true,
    deviceName: device.deviceName,
  }, {
    active: false,
    deactivatedBy: actorId,
  });
}

export async function deleteDevice(
  deviceId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new NotFoundError('Device not found');
  if (device.tenantId !== tenantId) throw new ForbiddenError('Device does not belong to this tenant');
  if (device.active) throw new ValidationError('Cannot delete an active device — deactivate it first');

  await prisma.device.delete({ where: { id: deviceId } });

  await auditLicenceEvent(tenantId, actorId, deviceId, 'device_deleted', {
    deviceName: device.deviceName,
    fingerprint: device.fingerprint,
  }, null);
}

export async function listDevices(tenantId: string) {
  return prisma.device.findMany({
    where: { tenantId },
    orderBy: [{ active: 'desc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      user:    { select: { id: true, name: true, email: true } },
      licence: { select: { id: true, licenceNumber: true } },
    },
  });
}

// ─── Asset cap enforcement ───────────────────────────────────────────────────

export async function enforceAssetCap(tenantId: string): Promise<void> {
  const rootTenantId = await getRootTenantId(tenantId);

  const licence = await prisma.licence.findFirst({
    where: { tenantId: rootTenantId, status: { in: ['active', 'expiring'] } },
    include: { tier: true },
  });

  if (!licence) {
    throw new ForbiddenError('No active licence — cannot create assets');
  }

  const tenantIds = await getTenantFamily(rootTenantId);
  const count = await prisma.asset.count({ where: { tenantId: { in: tenantIds }, deletedAt: null } });
  if (count >= licence.tier.maxAssets) {
    throw new AppError(
      403,
      `Asset limit reached (${count}/${licence.tier.maxAssets}). Upgrade your licence to add more assets.`,
      'ASSET_CAP_REACHED',
    );
  }
}

// ─── Licence validation (deployment-mode aware) ──────────────────────────────

export async function validateLicence(tenantId: string): Promise<boolean> {
  const mode = getDeploymentMode();

  switch (mode) {
    case 'standalone':
      return validateLocally(tenantId);

    case 'saas':
      return validateViaCentralService(tenantId);

    case 'hybrid': {
      const local = await validateLocally(tenantId);
      // Fire-and-forget: periodic re-validation against central service
      validateViaCentralService(tenantId).catch((err) =>
        logger.warn('Hybrid licence re-validation failed — using local result', { tenantId, error: err.message }),
      );
      return local;
    }

    default:
      logger.error('Unknown DEPLOYMENT_MODE', { mode });
      return validateLocally(tenantId);
  }
}

async function validateLocally(tenantId: string): Promise<boolean> {
  const licence = await prisma.licence.findFirst({
    where: { tenantId, status: { in: ['active', 'expiring'] } },
    orderBy: { createdAt: 'desc' },
  });
  return !!licence;
}

async function validateViaCentralService(tenantId: string): Promise<boolean> {
  // In SaaS mode, this would call the central licensing API.
  // For now it falls back to local validation; the hook is here for
  // when the central service is deployed.
  logger.info('Central licence validation stub', { tenantId });
  return validateLocally(tenantId);
}

// ─── List all licences (for Licensing Authority console) ─────────────────────

const LICENCE_SORT_KEYS = [
  'licenceNumber', 'status', 'durationMonths', 'activatedAt', 'expiresAt',
  'createdAt', 'paymentConfirmed', 'tenant.name', 'tier.name',
] as const;

export async function listLicences(filters?: {
  status?: string;
  tenantId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.tenantId) where.tenantId = filters.tenantId;
  if (filters?.search) {
    where.OR = [
      { licenceNumber: { contains: filters.search, mode: 'insensitive' as const } },
      { tenant: { name: { contains: filters.search, mode: 'insensitive' as const } } },
      { tenant: { slug: { contains: filters.search, mode: 'insensitive' as const } } },
    ];
  }

  // buildOrderBy returns a generic Record; Prisma is happy with that shape at runtime,
  // but the orderBy field is typed narrowly — cast at the call site.
  const orderBy = buildOrderBy(
    filters?.sortBy,
    filters?.sortOrder,
    LICENCE_SORT_KEYS,
    { createdAt: 'desc' as const },
  ) as Prisma.LicenceOrderByWithRelationInput;

  return prisma.licence.findMany({
    where,
    include: {
      tier: true,
      tenant: { select: { id: true, name: true, slug: true } },
      deviceSlots: true,
    },
    orderBy,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getTenantFamily(parentTenantId: string): Promise<string[]> {
  const children = await prisma.tenant.findMany({
    where: { parentTenantId },
    select: { id: true },
  });
  return [parentTenantId, ...children.map(c => c.id)];
}

async function getRootTenantId(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { parentTenantId: true },
  });
  return tenant?.parentTenantId ?? tenantId;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function auditLicenceEvent(
  tenantId: string,
  actorId: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  prisma.auditEvent.create({
    data: {
      tenantId,
      actorId,
      entityType: 'licence',
      entityId,
      action,
      before: before as never,
      after: after as never,
    },
  }).catch((e) => logger.error('Audit event write failed', { error: e.message }));
}
