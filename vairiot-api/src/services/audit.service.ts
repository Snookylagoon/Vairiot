import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';

export interface CreateCampaignInput {
  name: string;
  siteId?: string;
  locationId?: string;
  categoryId?: string;
  assetIds?: string[];
  scheduledAt?: string;
}

export async function listCampaigns(tenantId: string) {
  return prisma.auditCampaign.findMany({
    where: { tenantId },
    include: { _count: { select: { scanEvents: true, assets: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCampaign(tenantId: string, actorId: string, input: CreateCampaignInput) {
  const assetIds = (input.assetIds ?? []).filter(Boolean);
  return prisma.auditCampaign.create({
    data: {
      tenantId,
      createdBy: actorId,
      name: input.name,
      siteId: input.siteId,
      locationId: input.locationId,
      categoryId: input.categoryId,
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
  return prisma.auditCampaign.update({
    where: { id },
    data: { status: 'in_progress', startedAt: new Date() },
  });
}

export async function recordScan(tenantId: string, campaignId: string, actorId: string, input: { tagValue: string; deviceId?: string }) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'in_progress') throw new ConflictError('Campaign is not in progress', 'CAMPAIGN_NOT_ACTIVE');
  const asset = await prisma.asset.findFirst({
    where: { tenantId, OR: [{ rfidTag: input.tagValue }, { barcode: input.tagValue }] },
  });
  const result = asset ? 'found' : 'unknown';
  return prisma.auditScanEvent.create({
    data: {
      campaignId,
      tenantId,
      tagValue:  input.tagValue,
      assetId:   asset ? asset.id : undefined,
      scannedBy: actorId,
      deviceId:  input.deviceId,
      result,
    },
  });
}

export async function completeCampaign(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  if (c.status !== 'in_progress') throw new ConflictError('Campaign is not in progress', 'CAMPAIGN_NOT_ACTIVE');
  const scans = await prisma.auditScanEvent.findMany({ where: { campaignId: id } });
  const foundIds = new Set(scans.filter(s => s.assetId).map(s => s.assetId));
  const expected = await expectedAssets(tenantId, id, c);
  const missing = expected.filter(a => !foundIds.has(a.id))
    .map(a => ({ id: a.id, assetNumber: a.assetNumber, name: a.name }));
  const unknown = scans.filter(s => s.result === 'unknown');
  await prisma.auditCampaign.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date() },
  });
  return {
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
