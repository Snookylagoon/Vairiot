import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../lib/errors';
import { tenantHasFeature } from '../lib/feature-flags';
import { CampaignMode, ReconciliationClassification } from 'vairiot-shared';

export interface CreateCampaignInput {
  name: string;
  mode?: string;
  siteId?: string;
  locationId?: string;
  categoryId?: string;
  assetIds?: string[];
  scheduledAt?: string;
  linkedCampaignId?: string;
}

export async function listCampaigns(tenantId: string) {
  return prisma.auditCampaign.findMany({
    where: { tenantId },
    include: {
      _count: { select: { scanEvents: true, assets: true } },
      linkedFrom: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCampaign(tenantId: string, actorId: string, input: CreateCampaignInput) {
  const mode = input.mode ?? CampaignMode.Sighted;

  if (mode === CampaignMode.Blind) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenantHasFeature(tenant, 'blindAudit')) {
      throw new ForbiddenError('Blind audit is not enabled for this tenant');
    }
    if (!input.siteId && !input.linkedCampaignId) {
      throw new ValidationError('Blind campaigns require a site to be specified');
    }
  }

  // Double-blind: inherit scope from the first campaign
  let linkedSiteId = input.siteId;
  let linkedLocationId = input.locationId;
  let linkedCategoryId = input.categoryId;
  if (input.linkedCampaignId) {
    const first = await prisma.auditCampaign.findFirst({
      where: { id: input.linkedCampaignId, tenantId },
    });
    if (!first) throw new NotFoundError('Linked campaign not found');
    if (first.mode !== CampaignMode.Blind) {
      throw new ValidationError('Can only link to a blind campaign');
    }
    if (first.status !== 'completed') {
      throw new ValidationError('The first campaign must be completed before creating a second count');
    }
    linkedSiteId = linkedSiteId ?? first.siteId ?? undefined;
    linkedLocationId = linkedLocationId ?? first.locationId ?? undefined;
    linkedCategoryId = linkedCategoryId ?? first.categoryId ?? undefined;
  }

  const assetIds = (input.assetIds ?? []).filter(Boolean);
  return prisma.auditCampaign.create({
    data: {
      tenantId,
      createdBy: actorId,
      name: input.name,
      mode,
      siteId: linkedSiteId,
      locationId: linkedLocationId,
      categoryId: linkedCategoryId,
      linkedCampaignId: input.linkedCampaignId,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      assets: assetIds.length ? { create: assetIds.map(assetId => ({ assetId })) } : undefined,
    },
  });
}

/**
 * Resolve the set of assets a campaign expects to find.
 * Precedence: explicit asset list (if any) → otherwise filter active
 * tenant assets by site / location / category (any combination).
 */
async function expectedAssets(
  tenantId: string,
  campaignId: string,
  scope: { siteId: string | null; locationId: string | null; categoryId: string | null },
  include?: Prisma.AssetInclude,
) {
  const explicit = await prisma.auditCampaignAsset.findMany({
    where: { campaignId },
    select: { assetId: true },
  });
  if (explicit.length) {
    return prisma.asset.findMany({
      where: { tenantId, id: { in: explicit.map(e => e.assetId) } },
      ...(include ? { include } : {}),
    });
  }
  return prisma.asset.findMany({
    where: {
      tenantId,
      status: 'active',
      ...(scope.siteId     && { siteId:     scope.siteId }),
      ...(scope.locationId && { locationId: scope.locationId }),
      ...(scope.categoryId && { categoryId: scope.categoryId }),
    },
    ...(include ? { include } : {}),
  });
}

export async function startCampaign(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'draft') throw new ConflictError('Campaign already started', 'ALREADY_STARTED');

  if (c.mode === CampaignMode.Blind) {
    return prisma.$transaction(async (tx) => {
      const assets = await expectedAssets(tenantId, id, c);
      if (assets.length > 0) {
        await tx.auditSnapshotAsset.createMany({
          data: assets.map(a => ({
            campaignId:    id,
            assetId:       a.id,
            assetNumber:   a.assetNumber,
            name:          a.name,
            rfidTag:       a.rfidTag,
            barcode:       a.barcode,
            siteId:        a.siteId,
            locationId:    a.locationId,
            categoryId:    a.categoryId,
            condition:     a.condition,
            purchaseCost:  a.purchaseCost,
            residualValue: a.residualValue,
          })),
        });
      }
      return tx.auditCampaign.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
    });
  }

  return prisma.auditCampaign.update({
    where: { id },
    data: { status: 'in_progress', startedAt: new Date() },
  });
}

export async function getSnapshotAssets(campaignId: string) {
  return prisma.auditSnapshotAsset.findMany({ where: { campaignId } });
}

export interface RecordScanInput {
  tagValue: string;
  deviceId?: string;
  locationId?: string;
  condition?: string;
  /** Client-generated idempotency key — replays of the same queued scan return the original event. */
  clientRequestId?: string;
  /** When the device actually captured the scan (ISO); server-clamped to a sane window. */
  capturedAt?: string;
}

// Accept device capture times up to 90 days in the past and 10 minutes of
// clock skew into the future; anything outside falls back to server time.
function clampCapturedAt(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return undefined;
  const now = Date.now();
  if (t.getTime() > now + 10 * 60 * 1000) return new Date();
  if (t.getTime() < now - 90 * 24 * 3600 * 1000) return undefined;
  return t;
}

export async function recordScan(tenantId: string, campaignId: string, actorId: string, input: RecordScanInput) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');

  // Idempotent replay: if this client request was already recorded, return the
  // original event instead of double-counting. Checked before the status guard
  // so a replay after the campaign closes still resolves instead of erroring.
  if (input.clientRequestId) {
    const existing = await prisma.auditScanEvent.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing && existing.tenantId === tenantId) {
      return c.mode === CampaignMode.Blind
        ? { ...existing, result: 'recorded', duplicate: true }
        : { ...existing, duplicate: true };
    }
  }

  if (c.status !== 'in_progress') throw new ConflictError('Campaign is not in progress', 'CAMPAIGN_NOT_ACTIVE');

  const isBlind = c.mode === CampaignMode.Blind;

  if (isBlind) {
    if (!input.locationId) {
      throw new ValidationError('Blind campaigns require a locationId with each scan');
    }
    const zoneSubmitted = await prisma.auditZoneSubmission.findUnique({
      where: { campaignId_locationId: { campaignId, locationId: input.locationId } },
    });
    if (zoneSubmitted) {
      throw new ConflictError('This zone has already been submitted and is locked', 'ZONE_LOCKED');
    }
  }

  const asset = await prisma.asset.findFirst({
    where: { tenantId, OR: [{ rfidTag: input.tagValue }, { barcode: input.tagValue }] },
  });

  const internalResult = asset ? 'found' : 'unknown';

  let scanEvent;
  try {
    scanEvent = await prisma.auditScanEvent.create({
      data: {
        campaignId,
        tenantId,
        tagValue:   input.tagValue,
        assetId:    asset ? asset.id : undefined,
        scannedBy:  actorId,
        deviceId:   input.deviceId,
        locationId: input.locationId,
        condition:  input.condition,
        result:     internalResult,
        capturedAt: clampCapturedAt(input.capturedAt),
        clientRequestId: input.clientRequestId,
      },
    });
  } catch (e: unknown) {
    // Unique violation on clientRequestId — a concurrent replay won the race.
    if (input.clientRequestId && (e as { code?: string }).code === 'P2002') {
      const existing = await prisma.auditScanEvent.findUnique({
        where: { clientRequestId: input.clientRequestId },
      });
      if (existing && existing.tenantId === tenantId) {
        return isBlind
          ? { ...existing, result: 'recorded', duplicate: true }
          : { ...existing, duplicate: true };
      }
    }
    throw e;
  }

  if (isBlind) {
    return { ...scanEvent, result: 'recorded' };
  }
  return scanEvent;
}

export async function submitZone(tenantId: string, campaignId: string, locationId: string, actorId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'in_progress') throw new ConflictError('Campaign is not in progress', 'CAMPAIGN_NOT_ACTIVE');
  if (c.mode !== CampaignMode.Blind) throw new ValidationError('Zone submission is only available for blind campaigns');

  const existing = await prisma.auditZoneSubmission.findUnique({
    where: { campaignId_locationId: { campaignId, locationId } },
  });
  if (existing) throw new ConflictError('This zone has already been submitted', 'ZONE_ALREADY_SUBMITTED');

  return prisma.auditZoneSubmission.create({
    data: { campaignId, locationId, submittedBy: actorId },
  });
}

export async function listZoneSubmissions(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  return prisma.auditZoneSubmission.findMany({
    where: { campaignId },
    orderBy: { submittedAt: 'asc' },
  });
}

export async function runReconciliation(campaignId: string) {
  const snapshot = await prisma.auditSnapshotAsset.findMany({ where: { campaignId } });
  const scans = await prisma.auditScanEvent.findMany({ where: { campaignId } });

  // Group scans by assetId for efficient lookup
  const scansByAssetId = new Map<string, typeof scans>();
  for (const s of scans) {
    if (s.assetId) {
      const existing = scansByAssetId.get(s.assetId) ?? [];
      existing.push(s);
      scansByAssetId.set(s.assetId, existing);
    }
  }

  const items: Array<{
    campaignId: string;
    snapshotAssetId?: string;
    scanEventId?: string;
    classification: string;
    snapshotLocationId?: string;
    foundLocationId?: string;
    snapshotCondition?: string;
    foundCondition?: string;
  }> = [];

  const matchedScanIds = new Set<string>();

  for (const asset of snapshot) {
    const assetScans = scansByAssetId.get(asset.assetId);

    if (!assetScans || assetScans.length === 0) {
      items.push({
        campaignId,
        snapshotAssetId:    asset.id,
        classification:     ReconciliationClassification.Missing,
        snapshotLocationId: asset.locationId ?? undefined,
        snapshotCondition:  asset.condition ?? undefined,
      });
      continue;
    }

    // Use the first scan for this asset as the primary match
    const scan = assetScans[0];
    matchedScanIds.add(scan.id);

    const locationMismatch = scan.locationId && asset.locationId && scan.locationId !== asset.locationId;
    const conditionMismatch = scan.condition && asset.condition && scan.condition !== asset.condition;

    let classification: string;
    if (locationMismatch) {
      classification = ReconciliationClassification.Misplaced;
    } else if (conditionMismatch) {
      classification = ReconciliationClassification.ConditionVariance;
    } else {
      classification = ReconciliationClassification.Verified;
    }

    items.push({
      campaignId,
      snapshotAssetId:    asset.id,
      scanEventId:        scan.id,
      classification,
      snapshotLocationId: asset.locationId ?? undefined,
      foundLocationId:    scan.locationId ?? undefined,
      snapshotCondition:  asset.condition ?? undefined,
      foundCondition:     scan.condition ?? undefined,
    });
  }

  // Surplus: scans with no matching asset in the snapshot
  for (const scan of scans) {
    if (!scan.assetId && !matchedScanIds.has(scan.id)) {
      items.push({
        campaignId,
        scanEventId:     scan.id,
        classification:  ReconciliationClassification.Surplus,
        foundLocationId: scan.locationId ?? undefined,
        foundCondition:  scan.condition ?? undefined,
      });
    }
  }

  // Clear any prior reconciliation run and insert fresh
  await prisma.$transaction([
    prisma.auditReconciliationItem.deleteMany({ where: { campaignId } }),
    prisma.auditReconciliationItem.createMany({ data: items }),
  ]);

  return items;
}

export async function getReconciliation(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  return prisma.auditReconciliationItem.findMany({
    where: { campaignId },
    include: { snapshotAsset: true, scanEvent: true },
    orderBy: { classification: 'asc' },
  });
}

export async function completeCampaign(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'in_progress' && c.status !== 'completed') {
    throw new ConflictError('Campaign is not in progress', 'CAMPAIGN_NOT_ACTIVE');
  }

  // Completing is idempotent: re-completing an already-completed campaign just
  // returns the same report instead of erroring, so retries (flaky network,
  // duplicate taps) don't surface a confusing conflict.
  const wasInProgress = c.status === 'in_progress';

  if (wasInProgress && c.mode === CampaignMode.Blind) {
    const submissions = await prisma.auditZoneSubmission.findMany({ where: { campaignId: id } });
    if (submissions.length === 0) {
      throw new ValidationError('At least one zone must be submitted before completing a blind campaign');
    }
  }

  const scans = await prisma.auditScanEvent.findMany({ where: { campaignId: id } });
  const foundIds = new Set(scans.filter(s => s.assetId).map(s => s.assetId));
  const expected = await expectedAssets(tenantId, id, c);
  const missing = expected.filter(a => !foundIds.has(a.id))
    .map(a => ({ id: a.id, assetNumber: a.assetNumber, name: a.name }));
  const unknown = scans.filter(s => s.result === 'unknown');

  if (wasInProgress) {
    await prisma.auditCampaign.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });

    if (c.mode === CampaignMode.Blind) {
      await runReconciliation(id);
    }
  }

  return {
    justCompleted: wasInProgress,
    campaignId: id,
    totalScanned: scans.length,
    totalExpected: expected.length,
    found: foundIds.size,
    missing,
    unknownTags: unknown.map(s => s.tagValue),
  };
}

export async function getCampaignReport(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({
    where: { id, tenantId },
    include: { scanEvents: true },
  });
  if (!c) throw new NotFoundError('Campaign not found');
  return c;
}

export async function getCampaignReportRows(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  const scans = await prisma.auditScanEvent.findMany({
    where: { campaignId: id },
    orderBy: { scannedAt: 'asc' },
  });
  const scannedAssetIds = scans.filter(s => s.assetId).map(s => s.assetId!);
  const scannedAssets = await prisma.asset.findMany({
    where: { id: { in: scannedAssetIds }, tenantId },
    include: { category: true, site: true, location: true },
  });
  const assetById = new Map(scannedAssets.map(a => [a.id, a]));
  const scansWithAsset = scans.map(s => ({ ...s, asset: s.assetId ? assetById.get(s.assetId) ?? null : null }));
  const foundIds = new Set(scannedAssetIds);
  const expected = await expectedAssets(tenantId, id, c, {
    category: true, site: true, location: true,
  });
  const missing = expected.filter(a => !foundIds.has(a.id));
  return { campaign: c, scans: scansWithAsset, missing };
}

// ─── Adjustments + Audit Trail ───────────────────────────────────────────────

export interface PostAdjustmentInput {
  reconciliationItemId: string;
  adjustmentType: string;
  fieldChanged?: string;
  valueAfter?: string;
  justification: string;
  applyToRegister?: boolean;
}

export async function postAdjustment(
  tenantId: string,
  campaignId: string,
  actorId: string,
  input: PostAdjustmentInput,
) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'completed') throw new ConflictError('Campaign must be completed before posting adjustments', 'CAMPAIGN_NOT_COMPLETED');

  const item = await prisma.auditReconciliationItem.findFirst({
    where: { id: input.reconciliationItemId, campaignId },
    include: { snapshotAsset: true, scanEvent: true },
  });
  if (!item) throw new NotFoundError('Reconciliation item not found');

  // Segregation of duties: the auditor who submitted the zone cannot approve adjustments for it
  const locationId = item.foundLocationId ?? item.snapshotLocationId;
  if (locationId) {
    const zoneSubmission = await prisma.auditZoneSubmission.findUnique({
      where: { campaignId_locationId: { campaignId, locationId } },
    });
    if (zoneSubmission && zoneSubmission.submittedBy === actorId) {
      throw new ForbiddenError('You cannot approve adjustments for a zone you audited');
    }
  }

  // Determine the before value from the snapshot or current asset
  let valueBefore: string | undefined;
  if (input.fieldChanged && item.snapshotAsset) {
    const snap = item.snapshotAsset as Record<string, unknown>;
    const raw = snap[input.fieldChanged];
    valueBefore = raw != null ? String(raw) : undefined;
  }

  const shouldApply = input.applyToRegister ?? false;
  const now = new Date();

  const adjustment = await prisma.auditAdjustment.create({
    data: {
      campaignId,
      reconciliationItemId: input.reconciliationItemId,
      adjustmentType:       input.adjustmentType,
      fieldChanged:         input.fieldChanged,
      valueBefore,
      valueAfter:           input.valueAfter,
      justification:        input.justification,
      postedBy:             actorId,
      appliedToRegister:    shouldApply,
      appliedAt:            shouldApply ? now : undefined,
    },
  });

  // Apply the change to the live register if requested
  if (shouldApply && item.snapshotAsset && input.fieldChanged && input.valueAfter !== undefined) {
    const assetId = item.snapshotAsset.assetId;
    const updateData: Record<string, string> = { [input.fieldChanged]: input.valueAfter };

    await prisma.asset.update({
      where: { id: assetId },
      data: updateData,
    });

    // Write to the system audit trail
    await prisma.auditEvent.create({
      data: {
        tenantId,
        actorId,
        entityType: 'asset',
        entityId:   assetId,
        action:     'audit_adjustment',
        before:     valueBefore != null ? { [input.fieldChanged]: valueBefore } : undefined,
        after:      { [input.fieldChanged]: input.valueAfter },
        metadata:   { campaignId, adjustmentId: adjustment.id, adjustmentType: input.adjustmentType },
      },
    });
  }

  return adjustment;
}

export async function listAdjustments(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  return prisma.auditAdjustment.findMany({
    where: { campaignId },
    include: { reconciliationItem: { include: { snapshotAsset: true } } },
    orderBy: { postedAt: 'desc' },
  });
}

// ─── Double-blind comparison ────────────────────────────────────────────────

export async function getComparison(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({
    where: { id: campaignId, tenantId },
  });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.mode !== CampaignMode.Blind) throw new ValidationError('Comparison is only available for blind campaigns');

  // Find the paired campaign (either this is the second linking to the first, or the first linked from the second)
  let firstId: string;
  let secondId: string;
  if (c.linkedCampaignId) {
    firstId = c.linkedCampaignId;
    secondId = c.id;
  } else {
    const second = await prisma.auditCampaign.findFirst({
      where: { linkedCampaignId: c.id, tenantId },
    });
    if (!second) throw new ValidationError('No linked campaign found for comparison');
    firstId = c.id;
    secondId = second.id;
  }

  const [first, second] = await Promise.all([
    prisma.auditCampaign.findFirstOrThrow({ where: { id: firstId, tenantId } }),
    prisma.auditCampaign.findFirstOrThrow({ where: { id: secondId, tenantId } }),
  ]);

  if (first.status !== 'completed' || second.status !== 'completed') {
    throw new ValidationError('Both campaigns must be completed before comparison');
  }

  const [firstItems, secondItems] = await Promise.all([
    prisma.auditReconciliationItem.findMany({
      where: { campaignId: firstId },
      include: { snapshotAsset: true, scanEvent: true },
    }),
    prisma.auditReconciliationItem.findMany({
      where: { campaignId: secondId },
      include: { snapshotAsset: true, scanEvent: true },
    }),
  ]);

  // Index by snapshotAsset.assetId for matching
  const firstByAssetId = new Map<string, typeof firstItems[0]>();
  const firstSurplus: typeof firstItems = [];
  for (const item of firstItems) {
    if (item.snapshotAsset) {
      firstByAssetId.set(item.snapshotAsset.assetId, item);
    } else {
      firstSurplus.push(item);
    }
  }

  const secondByAssetId = new Map<string, typeof secondItems[0]>();
  const secondSurplus: typeof secondItems = [];
  for (const item of secondItems) {
    if (item.snapshotAsset) {
      secondByAssetId.set(item.snapshotAsset.assetId, item);
    } else {
      secondSurplus.push(item);
    }
  }

  const allAssetIds = new Set([...firstByAssetId.keys(), ...secondByAssetId.keys()]);
  const rows: Array<{
    assetId: string;
    assetNumber: string;
    name: string;
    firstClassification: string | null;
    secondClassification: string | null;
    agreement: boolean;
    firstLocationId: string | null;
    secondLocationId: string | null;
    firstCondition: string | null;
    secondCondition: string | null;
  }> = [];

  for (const assetId of allAssetIds) {
    const f = firstByAssetId.get(assetId);
    const s = secondByAssetId.get(assetId);
    const snap = f?.snapshotAsset ?? s?.snapshotAsset;
    rows.push({
      assetId,
      assetNumber: snap?.assetNumber ?? assetId,
      name: snap?.name ?? '',
      firstClassification: f?.classification ?? null,
      secondClassification: s?.classification ?? null,
      agreement: (f?.classification ?? null) === (s?.classification ?? null),
      firstLocationId: f?.foundLocationId ?? null,
      secondLocationId: s?.foundLocationId ?? null,
      firstCondition: f?.foundCondition ?? null,
      secondCondition: s?.foundCondition ?? null,
    });
  }

  // Surplus comparison by tag value
  const firstSurplusTags = new Set(firstSurplus.map(i => i.scanEvent?.tagValue).filter(Boolean));
  const secondSurplusTags = new Set(secondSurplus.map(i => i.scanEvent?.tagValue).filter(Boolean));
  const allSurplusTags = new Set([...firstSurplusTags, ...secondSurplusTags]);
  const surplusRows = [...allSurplusTags].map(tag => ({
    tagValue: tag!,
    inFirst: firstSurplusTags.has(tag),
    inSecond: secondSurplusTags.has(tag),
    agreement: firstSurplusTags.has(tag) === secondSurplusTags.has(tag),
  }));

  const agreementCount = rows.filter(r => r.agreement).length + surplusRows.filter(r => r.agreement).length;
  const totalCount = rows.length + surplusRows.length;

  return {
    firstCampaign: { id: firstId, name: first.name },
    secondCampaign: { id: secondId, name: second.name },
    agreementRate: totalCount > 0 ? Math.round((agreementCount / totalCount) * 100) : 100,
    totalItems: totalCount,
    agreements: agreementCount,
    disagreements: totalCount - agreementCount,
    assets: rows,
    surplus: surplusRows,
  };
}
