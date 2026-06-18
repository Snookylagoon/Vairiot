import { prisma } from '../lib/prisma';

export interface CreateCampaignInput {
  name: string;
  siteId?: string;
  locationId?: string;
  scheduledAt?: string;
}

export async function listCampaigns(tenantId: string) {
  return prisma.auditCampaign.findMany({
    where: { tenantId },
    include: { _count: { select: { scanEvents: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCampaign(tenantId: string, actorId: string, input: CreateCampaignInput) {
  return prisma.auditCampaign.create({
    data: {
      tenantId,
      createdBy: actorId,
      name: input.name,
      siteId: input.siteId,
      locationId: input.locationId,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    },
  });
}

export async function startCampaign(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new Error('NOT_FOUND');
  if (c.status !== 'draft') throw new Error('ALREADY_STARTED');
  return prisma.auditCampaign.update({
    where: { id },
    data: { status: 'in_progress', startedAt: new Date() },
  });
}

export async function recordScan(tenantId: string, campaignId: string, actorId: string, input: { tagValue: string; deviceId?: string }) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new Error('NOT_FOUND');
  if (c.status !== 'in_progress') throw new Error('CAMPAIGN_NOT_ACTIVE');
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
  if (!c) throw new Error('NOT_FOUND');
  if (c.status !== 'in_progress') throw new Error('CAMPAIGN_NOT_ACTIVE');
  const scans = await prisma.auditScanEvent.findMany({ where: { campaignId: id } });
  const foundIds = new Set(scans.filter(s => s.assetId).map(s => s.assetId));
  const expected = await prisma.asset.findMany({
    where: {
      tenantId,
      status: 'active',
      ...(c.siteId     && { siteId:     c.siteId }),
      ...(c.locationId && { locationId: c.locationId }),
    },
    select: { id: true, assetNumber: true, name: true },
  });
  const missing = expected.filter(a => !foundIds.has(a.id));
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
  if (!c) throw new Error('NOT_FOUND');
  return c;
}

export async function getCampaignReportRows(tenantId: string, id: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new Error('NOT_FOUND');
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
  const expected = await prisma.asset.findMany({
    where: { tenantId, status: 'active',
      ...(c.siteId     && { siteId:     c.siteId }),
      ...(c.locationId && { locationId: c.locationId }),
    },
    include: { category: true, site: true, location: true },
  });
  const missing = expected.filter(a => !foundIds.has(a.id));
  return { campaign: c, scans: scansWithAsset, missing };
}
