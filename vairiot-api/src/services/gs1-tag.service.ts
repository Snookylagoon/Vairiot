import {
  chooseEpc,
  decodeGiai96,
  isInternalEpc,
  permalockAllowed,
  tid96Epc,
} from 'vairiot-shared';

import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAssetEvent } from './asset-event.service';
import { recordAuditEvent } from './audit-event.service';
import { getIdentification } from './gs1-identification.service';
import { allocateIar } from './gs1-identifier.service';

/**
 * Commission a tag for an asset: validate the serialised TID, choose the EPC
 * by tenant mode, create/refresh the tag record and return the write plan the
 * device executes. Passwords are derived on the device and never appear here
 * (spec invariant 9). The binding is only created at verify (invariant 12).
 */
export async function commissionTag(
  tenantId: string,
  actorId: string,
  input: {
    assetId: string;
    tidHex: string;
    chipModel?: string;
    tagModel?: string;
    formFactor?: 'LABEL' | 'ON_METAL' | 'HARD_TAG' | 'SEWN_IN' | 'PLATE';
    deviceId?: string;
  },
) {
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, tenantId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError('Asset not found');

  // Serialised-TID procurement gate — rejects chips without an XTID serial.
  const tidHex = tid96Epc(input.tidHex);

  const ident = await getIdentification(tenantId);

  // Encode-on-discovery: an asset created before this feature has no IAR yet.
  let iar = asset.individualAssetReference;
  if (!iar) {
    iar = await allocateIar(tenantId, actorId, 'TAG_COMMISSION');
    await prisma.asset.update({
      where: { id: asset.id },
      data: { individualAssetReference: iar, allocationAuthority: 'SERVER' },
    });
    await prisma.identifierAllocation.update({
      where: {
        tenantId_individualAssetReference: { tenantId, individualAssetReference: iar },
      },
      data: { consumedByAssetId: asset.id },
    });
    await recordAssetEvent({
      tenantId, assetId: asset.id, eventType: 'IDENTIFIER_ASSIGNED', actor: actorId,
      source: 'API', payload: { individualAssetReference: iar },
    });
  }

  const { epcHex, scheme } = chooseEpc({
    mode: ident.mode,
    companyPrefix: ident.activePrefix?.prefix ?? null,
    iar,
    tidHex,
    filterValue: ident.filterValue,
  });

  const existing = await prisma.rfidTag.findUnique({ where: { tidHex } });
  if (existing) {
    if (existing.tenantId !== tenantId) {
      // Never leak another tenant's data (spec §6.1) — indistinguishable from unknown.
      throw new NotFoundError('Asset not found');
    }
    const activeBinding = await prisma.assetTagBinding.findFirst({
      where: { tagId: existing.id, unboundAt: null },
    });
    if (activeBinding && activeBinding.assetId !== input.assetId) {
      throw new ConflictError('Tag is already bound to another asset', 'TAG_ALREADY_BOUND');
    }
    if (existing.state === 'RETIRED') {
      throw new ConflictError('Tag is retired', 'TAG_RETIRED');
    }
  }

  const tag = await prisma.rfidTag.upsert({
    where: { tidHex },
    create: {
      tenantId,
      tidHex,
      epcHex,
      epcScheme: scheme,
      filterValue: ident.filterValue,
      chipModel: input.chipModel ?? null,
      tagModel: input.tagModel ?? null,
      formFactor: input.formFactor ?? 'LABEL',
      state: 'COMMISSIONED',
      commissionedAt: new Date(),
      commissionedBy: actorId.startsWith('apikey:') ? null : actorId,
      commissionedDeviceId: input.deviceId ?? null,
      killPwdSet: true,
      lockState: { epc: 'SECURED', accessPwd: 'LOCKED', killPwd: 'LOCKED' },
    },
    update: {
      epcHex,
      epcScheme: scheme,
      filterValue: ident.filterValue,
      state: 'COMMISSIONED',
      commissionedAt: new Date(),
      commissionedBy: actorId.startsWith('apikey:') ? null : actorId,
      commissionedDeviceId: input.deviceId ?? null,
      verifiedAt: null,
      verifyResult: undefined,
      quarantineReason: null,
    },
  });

  await recordAssetEvent({
    tenantId, assetId: asset.id, eventType: 'TAG_COMMISSIONED', actor: actorId,
    deviceId: input.deviceId, source: 'API',
    payload: { tagId: tag.id, tidHex, epcHex, scheme },
  });

  const gate = permalockAllowed({
    mode: ident.mode,
    allowInternalPermalock: ident.allowInternalPermalock,
    epcScheme: scheme,
    verifiedAt: null,
    settlingPeriodDays: ident.settlingPeriodDays,
    assetStatus: asset.status,
    now: new Date(),
  });

  return {
    tagId: tag.id,
    epcHex,
    epcScheme: scheme,
    writePlan: {
      epcBank: { bank: 1, wordPtr: 2, data: epcHex },
      reservedBank: { killPwdWordPtr: 0, accessPwdWordPtr: 2 },
      lockPlan: [
        { target: 'EPC', action: 'SECURED' },
        { target: 'ACCESS_PWD', action: 'SECURED' },
        { target: 'KILL_PWD', action: 'SECURED' },
      ],
      permalockAllowed: false,
      permalockBlockedReason: gate.reason ?? 'Settling period not elapsed',
    },
    tagKeyVersion: 1,
  };
}

/**
 * Record the mandatory post-write verification read. A match creates the
 * binding; a mismatch quarantines the tag and creates nothing (invariant 12).
 */
export async function verifyTag(
  tenantId: string,
  actorId: string,
  tagId: string,
  input: {
    assetId: string;
    readEpcHex: string;
    readTidHex: string;
    lockStateRead?: Record<string, string>;
    writeAttempts?: number;
    peakRssiDbm?: number;
    deviceId?: string;
  },
) {
  const tag = await prisma.rfidTag.findFirst({ where: { id: tagId, tenantId } });
  if (!tag) throw new NotFoundError('Tag not found');
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, tenantId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError('Asset not found');

  const readEpc = input.readEpcHex.trim().toUpperCase();
  const readTid = input.readTidHex.trim().toUpperCase();
  const verifyResult = {
    readEpcHex: readEpc,
    readTidHex: readTid,
    lockStateRead: input.lockStateRead ?? null,
    writeAttempts: input.writeAttempts ?? null,
    peakRssiDbm: input.peakRssiDbm ?? null,
  };

  if (readEpc !== tag.epcHex || readTid !== tag.tidHex) {
    await prisma.rfidTag.update({
      where: { id: tag.id },
      data: {
        state: 'QUARANTINED',
        quarantineReason: readTid !== tag.tidHex ? 'TID_MISMATCH' : 'EPC_MISMATCH',
        verifyResult,
      },
    });
    throw new ConflictError(
      readTid !== tag.tidHex
        ? 'TID changed between probe and verify — wrong tag written'
        : 'Read-back does not match the intended write',
      readTid !== tag.tidHex ? 'VERIFY_TID_MISMATCH' : 'VERIFY_MISMATCH',
    );
  }

  const now = new Date();
  const [, binding] = await prisma.$transaction([
    prisma.rfidTag.update({
      where: { id: tag.id },
      data: {
        verifiedAt: now,
        verifyResult,
        state: 'COMMISSIONED',
        lockState: input.lockStateRead ?? tag.lockState ?? {},
      },
    }),
    prisma.assetTagBinding.create({
      data: {
        tenantId,
        assetId: asset.id,
        tagId: tag.id,
        carrierType: 'RFID_UHF',
        payload: tag.epcHex,
        boundBy: actorId,
        boundDeviceId: input.deviceId ?? null,
      },
    }),
    // Keep the legacy quick-lookup field in step for existing UI/scan flows.
    prisma.asset.update({ where: { id: asset.id }, data: { rfidTag: tag.epcHex } }),
  ]);

  await recordAssetEvent({
    tenantId, assetId: asset.id, eventType: 'TAG_VERIFIED', actor: actorId,
    deviceId: input.deviceId, source: 'API',
    payload: { tagId: tag.id, bindingId: binding.id, peakRssiDbm: input.peakRssiDbm ?? null },
  });

  return { verified: true, bindingId: binding.id };
}

/** Permalock gate (spec §8.3). 409 PERMALOCK_BLOCKED unless every condition holds. */
export async function permalockTag(tenantId: string, actorId: string, tagId: string) {
  const tag = await prisma.rfidTag.findFirst({ where: { id: tagId, tenantId } });
  if (!tag) throw new NotFoundError('Tag not found');
  const binding = await prisma.assetTagBinding.findFirst({
    where: { tagId, unboundAt: null },
    include: { asset: { select: { id: true, status: true } } },
  });
  const ident = await getIdentification(tenantId);

  const gate = permalockAllowed({
    mode: ident.mode,
    allowInternalPermalock: ident.allowInternalPermalock,
    epcScheme: (tag.epcScheme ?? 'TID96') as 'GIAI96' | 'GIAI202' | 'TID96',
    verifiedAt: tag.verifiedAt ? tag.verifiedAt.toISOString() : null,
    settlingPeriodDays: ident.settlingPeriodDays,
    assetStatus: binding?.asset.status ?? 'unknown',
    now: new Date(),
  });
  if (!gate.allowed) {
    throw new AppError(409, gate.reason ?? 'Permalock preconditions not met', 'PERMALOCK_BLOCKED');
  }

  const lockState = (tag.lockState ?? {}) as Record<string, unknown>;
  await prisma.rfidTag.update({
    where: { id: tag.id },
    data: { lockState: { ...lockState, epc: 'PERMALOCKED' } },
  });
  if (binding) {
    await recordAssetEvent({
      tenantId, assetId: binding.asset.id, eventType: 'TAG_REENCODED', actor: actorId,
      source: 'API', payload: { tagId: tag.id, action: 'PERMALOCK' },
    });
  }
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'rfid_tag', entityId: tag.id,
    action: 'tag.permalocked',
  });
  return {
    allowed: true,
    lockPlan: [{ target: 'EPC', action: 'PERMALOCK' }],
  };
}

export async function retireTag(
  tenantId: string,
  actorId: string,
  tagId: string,
  reason: string,
) {
  const tag = await prisma.rfidTag.findFirst({ where: { id: tagId, tenantId } });
  if (!tag) throw new NotFoundError('Tag not found');
  const binding = await prisma.assetTagBinding.findFirst({
    where: { tagId, unboundAt: null },
  });
  await prisma.$transaction([
    prisma.rfidTag.update({
      where: { id: tag.id },
      data: { state: 'RETIRED', retiredAt: new Date(), retireReason: reason },
    }),
    ...(binding
      ? [
          prisma.assetTagBinding.update({
            where: { id: binding.id },
            data: { unboundAt: new Date(), unbindReason: `TAG_RETIRED: ${reason}` },
          }),
        ]
      : []),
  ]);
  if (binding) {
    await recordAssetEvent({
      tenantId, assetId: binding.assetId, eventType: 'TAG_RETIRED', actor: actorId,
      source: 'API', payload: { tagId: tag.id, reason },
    });
  }
  return { status: 'RETIRED', unboundAssetId: binding?.assetId ?? null };
}

export async function listTagsForAsset(tenantId: string, assetId: string) {
  return prisma.assetTagBinding.findMany({
    where: { tenantId, assetId },
    orderBy: { boundAt: 'desc' },
    include: {
      tag: {
        select: {
          id: true, tidHex: true, epcHex: true, epcScheme: true, state: true,
          verifiedAt: true, chipModel: true, formFactor: true, lockState: true,
        },
      },
    },
  });
}

/**
 * Resolve an EPC to an asset. A valid GIAI-96 whose prefix is ACTIVE for a
 * different tenant returns FOREIGN_TAG metadata rather than 404 (spec §6.6)
 * — without identifying the other tenant.
 */
export async function getAssetByEpc(tenantId: string, epcHex: string) {
  const epc = epcHex.trim().toUpperCase();
  const tag = await prisma.rfidTag.findFirst({
    where: { epcHex: epc, tenantId, retiredAt: null },
  });
  if (tag) {
    const binding = await prisma.assetTagBinding.findFirst({
      where: { tagId: tag.id, unboundAt: null },
      include: { asset: true },
    });
    if (binding) return { kind: 'ASSET' as const, asset: binding.asset, tag };
    return { kind: 'UNBOUND_TAG' as const, tag };
  }

  // Not ours. Classify before returning 404.
  if (/^[0-9A-F]{24}$/.test(epc) && !isInternalEpc(epc)) {
    try {
      const decoded = decodeGiai96(epc);
      const owner = await prisma.tenantGs1Prefix.findFirst({
        where: { prefix: decoded.companyPrefix, status: 'ACTIVE' },
        select: { tenantId: true },
      });
      if (owner && owner.tenantId !== tenantId) {
        return {
          kind: 'FOREIGN_TAG' as const,
          scheme: 'GIAI96' as const,
          companyPrefix: decoded.companyPrefix,
        };
      }
    } catch {
      // Not a GIAI-96 EPC — fall through to 404.
    }
  }
  throw new NotFoundError('No asset found for this EPC');
}
