import type { Prisma } from '@prisma/client';
import {
  assetDigitalLink,
  buildGiai,
  buildIarServer,
  canonicalise,
  encodeGiai96,
  GIAI96_PARTITIONS,
} from 'vairiot-shared';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';

const OPERATIONAL_HOST = process.env.VAIRIOT_DL_HOST ?? 'id.vairiot.com';
const SAMPLE_IAR = buildIarServer(12345); // '100000123454' — spec preview vector

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s.length >= 2 ? s : `tenant-${s}`;
}

/**
 * Read the tenant's identification block, provisioning the default INTERNAL
 * row on first access (INTERNAL mode is permanent and first-class).
 */
export async function getIdentification(tenantId: string) {
  let ident = await prisma.tenantIdentification.findUnique({ where: { tenantId } });
  if (!ident) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant not found');
    let slug = slugify(tenant.name);
    for (let attempt = 0; ; attempt++) {
      try {
        ident = await prisma.tenantIdentification.create({ data: { tenantId, slug } });
        break;
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code !== 'P2002' || attempt >= 3) throw e;
        slug = `${slugify(tenant.name)}-${tenantId.slice(-4)}${attempt || ''}`;
      }
    }
  }
  const activePrefix = await prisma.tenantGs1Prefix.findFirst({
    where: { tenantId, status: 'ACTIVE' },
  });
  return { ...ident, tidSampleRate: Number(ident.tidSampleRate), activePrefix };
}

export interface IdentificationPatch {
  slug?: string;
  tenantMark?: string | null;
  filterValue?: number;
  allowGiai202?: boolean;
  allowInternalPermalock?: boolean;
  settlingPeriodDays?: number;
  tidSampleRate?: number;
  digitalLinkHost?: string;
  readerProfiles?: Record<string, unknown>;
  confidenceThresholds?: Record<string, unknown>;
}

export async function updateIdentification(
  tenantId: string,
  actorId: string,
  patch: IdentificationPatch,
) {
  await getIdentification(tenantId); // ensure the row exists before updating
  if (patch.slug !== undefined && !/^[a-z0-9][a-z0-9-]{1,63}$/.test(patch.slug)) {
    throw new ValidationError('Slug must be 2-64 chars of lowercase letters, digits and hyphens');
  }
  if (patch.filterValue !== undefined && (patch.filterValue < 0 || patch.filterValue > 7)) {
    throw new ValidationError('filterValue must be between 0 and 7');
  }
  try {
    await prisma.tenantIdentification.update({
      where: { tenantId },
      data: {
        slug: patch.slug,
        tenantMark: patch.tenantMark,
        filterValue: patch.filterValue,
        allowGiai202: patch.allowGiai202,
        allowInternalPermalock: patch.allowInternalPermalock,
        settlingPeriodDays: patch.settlingPeriodDays,
        tidSampleRate: patch.tidSampleRate,
        digitalLinkHost: patch.digitalLinkHost,
        readerProfiles: patch.readerProfiles as Prisma.InputJsonValue | undefined,
        confidenceThresholds: patch.confidenceThresholds as Prisma.InputJsonValue | undefined,
      },
    });
    recordAuditEvent({
      tenantId, actor: actorId, entityType: 'tenant_identification', entityId: tenantId,
      action: 'identification.updated', metadata: patch as Prisma.InputJsonValue,
    });
    return getIdentification(tenantId);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new ConflictError('Slug is already in use', 'SLUG_TAKEN');
    }
    throw e;
  }
}

function prefixPreview(prefix: string, tenantSlug: string) {
  const giai = buildGiai(prefix, SAMPLE_IAR);
  const partitionEntry = Object.entries(GIAI96_PARTITIONS).find(
    ([, p]) => p.cpDigits === prefix.length,
  );
  return {
    sampleIar: SAMPLE_IAR,
    sampleGiai: giai,
    sampleEpcHex: encodeGiai96(prefix, SAMPLE_IAR, 0),
    sampleDigitalLink: assetDigitalLink(
      { mode: 'GS1', giai, iar: SAMPLE_IAR, tenantSlug },
      OPERATIONAL_HOST,
    ),
    canonicalDigitalLink: canonicalise(`https://${OPERATIONAL_HOST}/8004/${giai}`),
    partition: partitionEntry ? Number(partitionEntry[0]) : null,
    giaiLength: giai.length,
  };
}

export async function listPrefixes(tenantId: string) {
  return prisma.tenantGs1Prefix.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}

export async function createPrefix(
  tenantId: string,
  actorId: string,
  input: { prefix: string; gs1MemberOrg: string; licensedOn?: string; capacity?: number; notes?: string },
) {
  if (!/^\d{6,12}$/.test(input.prefix)) {
    throw new ValidationError('GS1 Company Prefix must be 6-12 digits');
  }
  if (input.prefix.length + 12 > 30) {
    throw new ValidationError('Prefix too long: GIAI would exceed 30 characters');
  }
  const ident = await getIdentification(tenantId); // ensures the identification row exists
  const claimed = await prisma.tenantGs1Prefix.findFirst({
    where: { prefix: input.prefix, status: { in: ['PENDING', 'ACTIVE'] } },
  });
  if (claimed) {
    throw new ConflictError(
      'This prefix is already registered' +
        (claimed.tenantId === tenantId ? ' for this tenant' : ''),
      'PREFIX_ALREADY_CLAIMED',
    );
  }
  try {
    const row = await prisma.tenantGs1Prefix.create({
      data: {
        tenantId,
        prefix: input.prefix,
        gs1MemberOrg: input.gs1MemberOrg,
        licensedOn: input.licensedOn ? new Date(input.licensedOn) : null,
        capacity: input.capacity ?? null,
        notes: input.notes ?? null,
        createdBy: actorId,
      },
    });
    recordAuditEvent({
      tenantId, actor: actorId, entityType: 'tenant_gs1_prefix', entityId: row.id,
      action: 'gs1_prefix.created', after: { prefix: input.prefix, status: row.status },
    });
    return { ...row, preview: prefixPreview(input.prefix, ident.slug) };
  } catch (e: unknown) {
    // The ux_prefix_global partial unique index closes the check-then-insert race.
    if ((e as { code?: string }).code === 'P2002') {
      throw new ConflictError('This prefix is already registered', 'PREFIX_ALREADY_CLAIMED');
    }
    throw e;
  }
}

/**
 * Activate a PENDING prefix (or supersede the current ACTIVE one). Runs the
 * database-side activate_tenant_prefix(), which preserves historic GIAIs into
 * asset_secondary_identifiers before the sync trigger recomputes every asset.
 */
export async function activatePrefix(
  tenantId: string,
  actorId: string,
  prefixId: string,
  opts: { confirmAssetCount?: number; reason?: string } = {},
) {
  const target = await prisma.tenantGs1Prefix.findFirst({ where: { id: prefixId, tenantId } });
  if (!target) throw new NotFoundError('Prefix not found');
  if (target.status !== 'PENDING') {
    throw new ConflictError(`Prefix is ${target.status}, expected PENDING`, 'PREFIX_NOT_PENDING');
  }

  const eligible = await prisma.asset.count({
    where: { tenantId, individualAssetReference: { not: null }, deletedAt: null },
  });
  if (opts.confirmAssetCount !== undefined && opts.confirmAssetCount !== eligible) {
    throw new ConflictError(
      `confirmAssetCount ${opts.confirmAssetCount} does not match the ${eligible} identified assets in this tenancy`,
      'ASSET_COUNT_MISMATCH',
    );
  }

  const hadActive = await prisma.tenantGs1Prefix.findFirst({
    where: { tenantId, status: 'ACTIVE' },
  });

  const [{ activate_tenant_prefix: assetsUpdated }] = await prisma.$queryRaw<
    Array<{ activate_tenant_prefix: number }>
  >`SELECT activate_tenant_prefix(${tenantId}, ${prefixId})`;

  const historicGiaisPreserved = hadActive
    ? await prisma.assetSecondaryIdentifier.count({
        where: { tenantId, scheme: 'GIAI_HISTORIC', value: { startsWith: hadActive.prefix } },
      })
    : 0;

  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'tenant_gs1_prefix', entityId: prefixId,
    action: hadActive ? 'gs1_prefix.superseded' : 'gs1_prefix.activated',
    metadata: {
      assetsUpdated, historicGiaisPreserved,
      supersededPrefixId: hadActive?.id ?? null, reason: opts.reason ?? null,
    },
  });

  return {
    mode: 'GS1' as const,
    assetsUpdated,
    historicGiaisPreserved,
    activatedAt: new Date().toISOString(),
  };
}

export async function withdrawPrefix(tenantId: string, actorId: string, prefixId: string) {
  const target = await prisma.tenantGs1Prefix.findFirst({ where: { id: prefixId, tenantId } });
  if (!target) throw new NotFoundError('Prefix not found');
  if (target.status !== 'PENDING') {
    throw new ConflictError('Only PENDING prefixes can be withdrawn', 'PREFIX_NOT_PENDING');
  }
  const row = await prisma.tenantGs1Prefix.update({
    where: { id: prefixId },
    data: { status: 'WITHDRAWN' },
  });
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'tenant_gs1_prefix', entityId: prefixId,
    action: 'gs1_prefix.withdrawn',
  });
  return row;
}

export function previewPrefix(prefix: string, tenantSlug: string) {
  if (!/^\d{6,12}$/.test(prefix)) {
    throw new ValidationError('GS1 Company Prefix must be 6-12 digits');
  }
  return prefixPreview(prefix, tenantSlug);
}
