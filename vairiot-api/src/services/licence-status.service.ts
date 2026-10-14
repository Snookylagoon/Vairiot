/**
 * Licence status, deployment-mode-aware validation and the Licensing
 * Authority listing.
 */
import type { Prisma } from '@prisma/client';
import { DEVICE_ONLINE_THRESHOLD_SECONDS } from 'vairiot-shared';

import { NotFoundError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { buildOrderBy } from '../lib/sort';

import { computeStatus, getTenantFamily } from './licence-helpers';

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
  deviceCount: number;    // active devices occupying a slot
  deviceOnline: number;   // active devices seen within the online threshold
  deviceWaiting: number;  // registered but inactive (queued, no free slot)
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

  const onlineSince = new Date(Date.now() - DEVICE_ONLINE_THRESHOLD_SECONDS * 1000);
  const deviceOnline = await prisma.device.count({
    where: { tenantId, active: true, lastSeenAt: { gt: onlineSince } },
  });

  const deviceWaiting = await prisma.device.count({
    where: { tenantId, active: false },
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
    deviceOnline,
    deviceWaiting,
  };
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
      tenant: { select: { id: true, name: true } },
      deviceSlots: true,
    },
    orderBy,
  });
}
