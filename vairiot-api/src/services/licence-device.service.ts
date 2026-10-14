/**
 * Device slots, registration, heartbeat and activation against the licence
 * allowance.
 */
import { DEVICE_ONLINE_THRESHOLD_SECONDS } from 'vairiot-shared';

import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

import { auditLicenceEvent } from './licence-helpers';

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

/**
 * Current slot accounting for a tenant: how many slots the active licence
 * grants, how many are currently occupied, and whether one is free.
 */
async function getAllowanceInfo(
  tenantId: string,
): Promise<{ allowance: number; activeDevices: number; free: boolean; licenceId: string | null }> {
  const licence = await prisma.licence.findFirst({
    where: { tenantId, status: { in: ['active', 'expiring'] } },
    include: { tier: true, deviceSlots: true },
  });
  const activeDevices = await prisma.device.count({ where: { tenantId, active: true } });
  const allowance = licence ? licence.tier.baseDevices + licence.deviceSlots.length : 1;
  return { allowance, activeDevices, free: activeDevices < allowance, licenceId: licence?.id ?? null };
}

type DeviceRow = Awaited<ReturnType<typeof prisma.device.findFirst>> & object;

// Update an existing device row on check-in, claiming a free slot if it was queued.
async function reuseDeviceRow(
  tenantId: string,
  existing: DeviceRow,
  data: { deviceName: string; deviceType?: string; serialNumber?: string; hardwareId?: string; userId?: string },
  actorId: string,
) {
  let { active, activatedAt, licenceId } = existing;
  if (!active) {
    const info = await getAllowanceInfo(tenantId);
    if (info.free) {
      active = true;
      activatedAt = new Date();
      licenceId = info.licenceId ?? existing.licenceId;
    }
  }
  const updated = await prisma.device.update({
    where: { id: existing.id },
    data: {
      deviceName: data.deviceName,
      deviceType: data.deviceType ?? existing.deviceType,
      serialNumber: data.serialNumber ?? existing.serialNumber,
      hardwareId: data.hardwareId ?? existing.hardwareId,
      userId: data.userId ?? existing.userId,
      active,
      activatedAt,
      licenceId,
      lastSeenAt: new Date(),
    },
  });
  if (!existing.active && updated.active) {
    await auditLicenceEvent(tenantId, actorId, updated.id, 'device_activated',
      { active: false }, { active: true, reason: 'slot_claimed_on_checkin' });
  }
  return updated;
}

// Survivor when collapsing duplicate handheld rows: prefer active, then most
// recently seen, then most recently created.
function pickSurvivor(dups: DeviceRow[]): DeviceRow {
  return [...dups].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const at = a.lastSeenAt?.getTime() ?? 0;
    const bt = b.lastSeenAt?.getTime() ?? 0;
    if (at !== bt) return bt - at;
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}

// Delete any other non-browser rows for the same (user, model) — stale duplicates
// of the same physical handheld.
async function collapseMobileDuplicates(
  tenantId: string,
  keepId: string,
  deviceName: string,
  userId: string,
): Promise<void> {
  const others = await prisma.device.findMany({
    where: { tenantId, deviceName, userId, deviceType: { not: 'browser' }, id: { not: keepId } },
    select: { id: true },
  });
  if (others.length) {
    await prisma.device.deleteMany({ where: { id: { in: others.map(o => o.id) } } });
  }
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

  // Browser fingerprints are stable per browser instance, so each one IS its own
  // device — two browsers under the same login are two devices. Mobile
  // fingerprints (ANDROID_ID) can change on reset/reinstall, so for mobile a new
  // fingerprint for the same model + user is treated as the SAME handheld (newest
  // wins) and duplicate rows are collapsed.
  const isBrowser = (data.deviceType ?? '') === 'browser';

  if (fingerprint) {
    const existing = await prisma.device.findUnique({
      where: { tenantId_fingerprint: { tenantId, fingerprint } },
    });
    if (existing) {
      const updated = await reuseDeviceRow(tenantId, existing, data, actorId);
      const ownerId = data.userId ?? existing.userId;
      if (!isBrowser && ownerId) {
        await collapseMobileDuplicates(tenantId, updated.id, data.deviceName, ownerId);
      }
      return { deviceId: updated.id, active: updated.active, reused: true };
    }

    // Mobile only: a new fingerprint for an existing (user, model) is the same
    // physical handheld — adopt it onto the surviving row and drop the duplicates.
    if (!isBrowser && data.userId) {
      const dups = await prisma.device.findMany({
        where: { tenantId, deviceName: data.deviceName, userId: data.userId, deviceType: { not: 'browser' } },
      });
      if (dups.length > 0) {
        const survivor = pickSurvivor(dups);
        const wasActive = dups.some(d => d.active);
        let active = survivor.active || wasActive;
        let activatedAt = active ? (survivor.activatedAt ?? new Date()) : survivor.activatedAt;
        let licenceId = survivor.licenceId;
        if (!active) {
          const info = await getAllowanceInfo(tenantId);
          if (info.free) {
            active = true;
            activatedAt = new Date();
            licenceId = info.licenceId ?? survivor.licenceId;
          }
        }
        const updated = await prisma.device.update({
          where: { id: survivor.id },
          data: {
            fingerprint,
            deviceType: data.deviceType ?? survivor.deviceType,
            serialNumber: data.serialNumber ?? survivor.serialNumber,
            hardwareId: data.hardwareId ?? survivor.hardwareId,
            active,
            activatedAt,
            licenceId,
            lastSeenAt: new Date(),
          },
        });
        const others = dups.filter(d => d.id !== survivor.id).map(d => d.id);
        if (others.length) {
          await prisma.device.deleteMany({ where: { id: { in: others } } });
          await auditLicenceEvent(tenantId, actorId, updated.id, 'device_deduplicated', null, {
            deviceName: data.deviceName,
            mergedCount: others.length,
          });
        }
        return { deviceId: updated.id, active: updated.active, reused: true };
      }
    }
  }

  // New device (browser with a new fingerprint, or a first-seen handheld). Over-
  // allowance devices still register, but as inactive (a visible queue); they
  // claim a slot later via check-in or manual activation when one frees up.
  const info = await getAllowanceInfo(tenantId);
  const canActivate = info.free;
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
      licenceId: info.licenceId,
      active: canActivate,
      activatedAt: canActivate ? now : null,
      lastSeenAt: now,
    },
  });

  await auditLicenceEvent(tenantId, actorId, device.id, 'device_registered', null, {
    deviceName: data.deviceName,
    activated: canActivate,
    activeDevices: info.activeDevices + (canActivate ? 1 : 0),
    allowance: info.allowance,
  });

  return { deviceId: device.id, active: canActivate, reused: false };
}

/**
 * Manually promote a queued (inactive) device into a free licence slot.
 * Refuses when the allowance is already full.
 */
export async function activateDevice(
  deviceId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new NotFoundError('Device not found');
  if (device.tenantId !== tenantId) throw new ForbiddenError('Device does not belong to this tenant');
  if (device.active) throw new ValidationError('Device is already active');

  const info = await getAllowanceInfo(tenantId);
  if (!info.free) {
    throw new AppError(
      409,
      `All ${info.allowance} device slots are in use. Deactivate another device or add a slot first.`,
      'DEVICE_LIMIT_REACHED',
    );
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: { active: true, activatedAt: new Date(), licenceId: info.licenceId ?? device.licenceId },
  });

  await auditLicenceEvent(tenantId, actorId, deviceId, 'device_activated', {
    active: false,
    deviceName: device.deviceName,
  }, {
    active: true,
    activatedBy: actorId,
  });
}

/**
 * Liveness check-in. Updates lastSeenAt for the matching device so the panel
 * can show "connected now", and opportunistically claims a free slot for a
 * queued device. Best-effort — returns whether the device was found/active.
 */
export async function heartbeatDevice(
  tenantId: string,
  fingerprint: string,
  userId?: string,
): Promise<{ online: boolean; active: boolean }> {
  const fp = fingerprint?.trim();
  if (!fp) return { online: false, active: false };

  const device = await prisma.device.findUnique({
    where: { tenantId_fingerprint: { tenantId, fingerprint: fp } },
  });
  if (!device) return { online: false, active: false };

  let { active, activatedAt, licenceId } = device;
  if (!active) {
    const info = await getAllowanceInfo(tenantId);
    if (info.free) {
      active = true;
      activatedAt = new Date();
      licenceId = info.licenceId ?? device.licenceId;
    }
  }

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date(), active, activatedAt, licenceId, userId: userId ?? device.userId },
  });

  if (!device.active && updated.active) {
    await auditLicenceEvent(tenantId, userId ?? device.userId ?? 'system', updated.id, 'device_activated',
      { active: false }, { active: true, reason: 'slot_claimed_on_heartbeat' });
  }

  return { online: true, active: updated.active };
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
  const devices = await prisma.device.findMany({
    where: { tenantId },
    orderBy: [{ active: 'desc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      user:    { select: { id: true, name: true, email: true } },
      licence: { select: { id: true, licenceNumber: true } },
    },
  });
  const onlineSince = Date.now() - DEVICE_ONLINE_THRESHOLD_SECONDS * 1000;
  return devices.map(d => ({
    ...d,
    online: !!d.lastSeenAt && d.lastSeenAt.getTime() > onlineSince,
  }));
}
