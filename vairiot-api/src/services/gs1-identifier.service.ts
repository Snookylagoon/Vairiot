import { randomUUID } from 'crypto';

import {
  assetDigitalLink,
  buildGiai,
  canonicalise,
  chooseEpc,
  epcPureIdentityUri,
  epcTagUri,
  formatHri,
  gs1CheckDigit,
  gs1128ElementString,
  Gs1Error,
  iarAuthority,
  isValidIar,
} from 'vairiot-shared';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';
import { getIdentification } from './gs1-identification.service';

const OPERATIONAL_HOST = process.env.VAIRIOT_DL_HOST ?? 'id.vairiot.com';

/** Allocate one server IAR inside the caller's flow. Never caller-supplied. */
export async function allocateIar(
  tenantId: string,
  actorId: string | null,
  purpose: string,
): Promise<string> {
  const [{ allocate_iar: iar }] = await prisma.$queryRaw<
    Array<{ allocate_iar: string }>
  >`SELECT allocate_iar(${tenantId}, ${actorId}, ${purpose})`;
  return iar;
}

export async function allocateIdentifiers(
  tenantId: string,
  actorId: string,
  count: number,
  purpose: string,
) {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new ValidationError('count must be between 1 and 100');
  }
  const ident = await getIdentification(tenantId);
  const allocations = [];
  for (let i = 0; i < count; i++) {
    const iar = await allocateIar(tenantId, actorId, purpose);
    allocations.push({
      individualAssetReference: iar,
      authority: 'SERVER' as const,
      hri: formatHri(iar, ident.tenantMark ?? ''),
      giai: ident.activePrefix ? buildGiai(ident.activePrefix.prefix, iar) : null,
    });
  }
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'identifier_allocation',
    entityId: allocations[0].individualAssetReference,
    action: 'identifier.allocated', metadata: { count, purpose },
  });
  return { allocations };
}

/** Lease a block of pre-computed IARs to a device for offline allocation. */
export async function leaseBlock(
  tenantId: string,
  actorId: string,
  input: { deviceId: string; size?: number; ttlHours?: number },
) {
  const size = input.size ?? 500;
  const ttlHours = input.ttlHours ?? 72;
  if (!Number.isInteger(size) || size < 1 || size > 5000) {
    throw new ValidationError('Block size must be between 1 and 5000');
  }
  const device = await prisma.device.findFirst({
    where: { id: input.deviceId, tenantId },
  });
  if (!device) throw new NotFoundError('Device not found');
  if (!device.active) throw new ConflictError('Device is not active', 'DEVICE_INACTIVE');

  const blockId = randomUUID();
  const actorUserId = actorId.startsWith('apikey:') ? null : actorId;
  await prisma.$queryRaw`SELECT lease_identifier_block(
    ${blockId}, ${tenantId}, ${input.deviceId}, ${actorUserId ?? 'api'}, ${size}, ${ttlHours})`;

  const block = await prisma.identifierBlock.findUniqueOrThrow({ where: { id: blockId } });
  const allocations = await prisma.identifierAllocation.findMany({
    where: { blockId },
    orderBy: { sequenceValue: 'asc' },
    select: { individualAssetReference: true },
  });
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'identifier_block', entityId: blockId,
    action: 'identifier_block.leased',
    metadata: { deviceId: input.deviceId, size, ttlHours },
  });
  return {
    blockId,
    firstSequence: Number(block.firstSequence),
    lastSequence: Number(block.lastSequence),
    expiresAt: block.expiresAt.toISOString(),
    references: allocations.map((a) => a.individualAssetReference),
  };
}

/**
 * Settle a block: values below nextUnconsumed become CONSUMED, values at or
 * above become RELEASED. Consumed strictly ascending, so a partial settle is
 * unambiguous. Late settles are accepted; conflicts are reported, never merged.
 */
export async function settleBlock(
  tenantId: string,
  actorId: string,
  blockId: string,
  input: { nextUnconsumed: number },
) {
  const block = await prisma.identifierBlock.findFirst({ where: { id: blockId, tenantId } });
  if (!block) throw new NotFoundError('Block not found');
  const first = Number(block.firstSequence);
  const last = Number(block.lastSequence);
  const next = input.nextUnconsumed;
  if (!Number.isInteger(next) || next < first || next > last + 1) {
    throw new ValidationError(
      `nextUnconsumed must be between ${first} and ${last + 1}`,
    );
  }

  // A late settle after expiry may collide with re-issued values.
  const conflicts = await prisma.identifierAllocation.findMany({
    where: {
      tenantId, blockId,
      sequenceValue: { lt: BigInt(next) },
      status: 'RELEASED',
      consumedByAssetId: { not: null },
    },
    select: { individualAssetReference: true },
  });

  const [consumed, released] = await prisma.$transaction([
    prisma.identifierAllocation.updateMany({
      where: { tenantId, blockId, status: 'RESERVED', sequenceValue: { lt: BigInt(next) } },
      data: { status: 'CONSUMED' },
    }),
    prisma.identifierAllocation.updateMany({
      where: { tenantId, blockId, status: 'RESERVED', sequenceValue: { gte: BigInt(next) } },
      data: { status: 'RELEASED' },
    }),
    prisma.identifierBlock.update({
      where: { id: blockId },
      data: { status: 'SETTLED', nextUnconsumed: BigInt(next), settledAt: new Date() },
    }),
  ]);

  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'identifier_block', entityId: blockId,
    action: 'identifier_block.settled',
    metadata: { nextUnconsumed: next, consumed: consumed.count, released: released.count,
                conflicts: conflicts.length },
  });
  if (conflicts.length > 0) {
    throw new ConflictError(
      `Late settle collided with ${conflicts.length} re-issued value(s): ` +
        conflicts.map((c) => c.individualAssetReference).join(', '),
      'BLOCK_CONFLICT',
    );
  }
  return { consumed: consumed.count, released: released.count, conflicts: [] };
}

export async function listBlocks(tenantId: string, deviceId?: string) {
  const blocks = await prisma.identifierBlock.findMany({
    where: { tenantId, ...(deviceId ? { deviceId } : {}) },
    orderBy: { issuedAt: 'desc' },
    take: 100,
    include: { device: { select: { deviceName: true, hardwareId: true } } },
  });
  return blocks.map((b) => ({
    ...b,
    firstSequence: Number(b.firstSequence),
    lastSequence: Number(b.lastSequence),
    nextUnconsumed: b.nextUnconsumed === null ? null : Number(b.nextUnconsumed),
  }));
}

export function validateIarPublic(iar: string) {
  if (!isValidIar(iar)) return { valid: false as const };
  return {
    valid: true as const,
    authority: iarAuthority(iar),
    marker: iar[0],
    body: iar.slice(1, 11),
    checkDigit: gs1CheckDigit(iar.slice(0, 11)),
  };
}

/** Compute the full encoding bundle for an IAR (spec §6.3 /identifiers/encode). */
export async function encodeIdentifier(
  tenantId: string,
  input: { individualAssetReference: string; tidHex?: string },
) {
  const iar = input.individualAssetReference;
  if (!isValidIar(iar)) throw new ValidationError('Invalid individual asset reference');
  const ident = await getIdentification(tenantId);
  const mode = ident.mode;
  const prefix = ident.activePrefix?.prefix ?? null;
  const giai = prefix ? buildGiai(prefix, iar) : null;
  const digitalLink = assetDigitalLink(
    { mode, giai, iar, tenantSlug: ident.slug },
    ident.digitalLinkHost || OPERATIONAL_HOST,
  );

  let epcHex: string | null = null;
  let scheme: string | null = null;
  if (input.tidHex || mode === 'GS1') {
    try {
      const chosen = chooseEpc({
        mode,
        companyPrefix: prefix,
        iar,
        tidHex: input.tidHex ?? '',
        filterValue: ident.filterValue,
      });
      epcHex = chosen.epcHex;
      scheme = chosen.scheme;
    } catch (e) {
      if (mode === 'GS1') throw e; // GS1 encoding must not fail silently
      if (!(e instanceof Gs1Error)) throw e;
      // INTERNAL mode without a usable TID: no EPC, QR/manual carriers only.
    }
  }

  return {
    mode,
    scheme,
    epcHex,
    giai,
    hri: formatHri(iar, ident.tenantMark ?? ''),
    tagUri: mode === 'GS1' && prefix ? epcTagUri(prefix, iar, ident.filterValue) : null,
    pureIdentityUri: mode === 'GS1' && prefix ? epcPureIdentityUri(prefix, iar) : null,
    elementString: gs1128ElementString({ mode, giai, iar }),
    digitalLink,
    canonicalDigitalLink: mode === 'GS1' && giai ? canonicalise(digitalLink) : null,
  };
}
