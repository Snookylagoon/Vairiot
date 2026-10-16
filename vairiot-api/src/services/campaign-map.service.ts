import { CampaignMode, ReconciliationClassification } from 'vairiot-shared';

import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { expectedAssets } from './audit.service';

// The campaign layer of the asset map (Phase 1 W4, stage 1.10): every asset
// the campaign expects, coloured by where the count stands, plus surplus tags.

export const CAMPAIGN_MAP_STATES = [
  ReconciliationClassification.Verified,
  ReconciliationClassification.Misplaced,
  ReconciliationClassification.ConditionVariance,
  ReconciliationClassification.Missing,
  ReconciliationClassification.Surplus,
  'not_scanned',
  'scanned',
] as const;
export type CampaignMapState = (typeof CAMPAIGN_MAP_STATES)[number];

export interface CampaignMapPoint {
  /** The asset, or the scan for a surplus tag. */
  id: string;
  assetId: string | null;
  assetNumber: string | null;
  name: string;
  state: CampaignMapState;
  latitude: number;
  longitude: number;
  geoAccuracyMeters: number | null;
  /** Where the position comes from: the register, or the scan that found it. */
  positionSource: 'register' | 'scan';
}

type Scan = {
  id: string; assetId: string | null; tagValue: string; locationId: string | null; condition: string | null;
  latitude: number | null; longitude: number | null; geoAccuracyMeters: number | null;
};

/** Live state of an expected asset from the scans so far. */
export function liveState(
  asset: { locationId: string | null; condition: string },
  scan: Scan | undefined,
  completed: boolean,
): CampaignMapState {
  if (!scan) return completed ? ReconciliationClassification.Missing : 'not_scanned';
  if (scan.locationId && asset.locationId && scan.locationId !== asset.locationId) {
    return ReconciliationClassification.Misplaced;
  }
  if (scan.condition && scan.condition !== asset.condition) return ReconciliationClassification.ConditionVariance;
  return ReconciliationClassification.Verified;
}

export async function getCampaignMap(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  const completed = c.status === 'completed';
  const blind = c.mode === CampaignMode.Blind;
  // A blind count in progress shows only progress: the classification would
  // tell the auditors what the register expects (as recordScan hides it).
  const hideResults = blind && !completed;

  const [assets, scans, items] = await Promise.all([
    expectedAssets(tenantId, campaignId, c),
    prisma.auditScanEvent.findMany({ where: { tenantId, campaignId }, orderBy: { scannedAt: 'asc' } }),
    blind && completed
      ? prisma.auditReconciliationItem.findMany({ where: { campaignId }, include: { snapshotAsset: { select: { assetId: true } } } })
      : Promise.resolve([]),
  ]);

  const firstScan = new Map<string, Scan>();
  for (const s of scans) if (s.assetId && !firstScan.has(s.assetId)) firstScan.set(s.assetId, s);
  const stored = new Map<string, string>();
  for (const i of items) if (i.snapshotAsset?.assetId) stored.set(i.snapshotAsset.assetId, i.classification);

  const points: CampaignMapPoint[] = [];
  let unplaced = 0;
  const expectedIds = new Set(assets.map((a) => a.id));

  for (const a of assets) {
    const scan = firstScan.get(a.id);
    const state: CampaignMapState = hideResults
      ? (scan ? 'scanned' : 'not_scanned')
      : ((stored.get(a.id) as CampaignMapState | undefined) ?? liveState(a, scan, completed));
    const fromRegister = a.latitude != null && a.longitude != null;
    const fromScan = !fromRegister && scan?.latitude != null && scan.longitude != null;
    if (!fromRegister && !fromScan) { unplaced++; continue; }
    points.push({
      id: a.id, assetId: a.id, assetNumber: a.assetNumber, name: a.name, state,
      latitude: fromRegister ? a.latitude! : scan!.latitude!,
      longitude: fromRegister ? a.longitude! : scan!.longitude!,
      geoAccuracyMeters: fromRegister ? a.geoAccuracyMeters : scan!.geoAccuracyMeters,
      positionSource: fromRegister ? 'register' : 'scan',
    });
  }

  // Tags the register doesn't expect, placed where they were scanned.
  if (!hideResults) {
    const seenTags = new Set<string>();
    for (const s of scans) {
      if (s.assetId && expectedIds.has(s.assetId)) continue;
      if (seenTags.has(s.tagValue)) continue;
      seenTags.add(s.tagValue);
      if (s.latitude == null || s.longitude == null) { unplaced++; continue; }
      points.push({
        id: s.id, assetId: s.assetId, assetNumber: null, name: s.tagValue,
        state: ReconciliationClassification.Surplus,
        latitude: s.latitude, longitude: s.longitude, geoAccuracyMeters: s.geoAccuracyMeters,
        positionSource: 'scan',
      });
    }
  }

  const counts = Object.fromEntries(CAMPAIGN_MAP_STATES.map((k) => [k, 0])) as Record<CampaignMapState, number>;
  for (const p of points) counts[p.state]++;
  return {
    campaign: { id: c.id, name: c.name, mode: c.mode, status: c.status },
    points,
    counts,
    unplaced,
  };
}
