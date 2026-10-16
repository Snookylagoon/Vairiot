import { CampaignMode, GeoError, validateGeoPosition } from 'vairiot-shared';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

import { tenantFeatureEnabled } from './tenant-features.service';

export interface RecordScanInput {
  tagValue: string;
  deviceId?: string;
  locationId?: string;
  condition?: string;
  /** Client-generated idempotency key — replays of the same queued scan return the original event. */
  clientRequestId?: string;
  /** When the device actually captured the scan (ISO); server-clamped to a sane window. */
  capturedAt?: string;
  /** Device position at the moment of the scan (stage 1.5); ignored while GIS is off. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  geoAccuracyMeters?: number | string | null;
}

/**
 * The scan's position columns, or nothing. A scan is never refused for its
 * position: queued offline work would otherwise be lost over a bad GPS
 * reading, so an unusable position is dropped and logged instead.
 */
export async function resolveScanGeo(tenantId: string, input: RecordScanInput) {
  if (input.latitude == null || input.longitude == null) return {};
  if (!(await tenantFeatureEnabled(tenantId, 'gis'))) return {};
  try {
    const position = validateGeoPosition(input.latitude, input.longitude);
    const accuracy = input.geoAccuracyMeters == null ? null : Number(input.geoAccuracyMeters);
    const geoAccuracyMeters = accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0
      ? Math.round(accuracy * 10) / 10 : null;
    return { ...position, geoAccuracyMeters, geoSource: 'device' };
  } catch (e) {
    if (!(e instanceof GeoError)) throw e;
    logger.warn('scan position dropped', { tenantId, reason: e.message });
    return {};
  }
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Clamps a device capture time into [campaign.startedAt − 1 day, now]. A scan
 * can't have happened after it reached the server, and can't predate the audit
 * by more than a day of clock skew; a device with a wrong clock gets the
 * nearest plausible time rather than a nonsense one. Campaigns without a start
 * (legacy rows) fall back to a 90-day window. Exported for tests.
 */
export function clampCapturedAt(
  raw: string | undefined,
  campaignStartedAt: Date | null,
  now: Date = new Date(),
): Date | undefined {
  if (!raw) return undefined;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return undefined;
  const upper = now.getTime();
  const lower = campaignStartedAt ? campaignStartedAt.getTime() - DAY_MS : upper - 90 * DAY_MS;
  return new Date(Math.min(Math.max(t, lower), upper));
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
        capturedAt: clampCapturedAt(input.capturedAt, c.startedAt),
        clientRequestId: input.clientRequestId,
        ...(await resolveScanGeo(tenantId, input)),
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

/**
 * The campaign's positioned scans as GeoJSON. Blind campaigns hide whether a
 * tag matched the register until the campaign is completed, as recordScan does.
 */
export async function listScanPositions(tenantId: string, campaignId: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  const hideResult = c.mode === CampaignMode.Blind && c.status !== 'completed';
  const scans = await prisma.auditScanEvent.findMany({
    where: { tenantId, campaignId, latitude: { not: null }, longitude: { not: null } },
    orderBy: { scannedAt: 'asc' },
    take: 10_000,
  });
  return {
    type: 'FeatureCollection' as const,
    features: scans.map((e) => ({
      type: 'Feature' as const,
      id: e.id,
      geometry: { type: 'Point' as const, coordinates: [e.longitude!, e.latitude!] },
      properties: {
        tagValue: e.tagValue,
        assetId: hideResult ? null : e.assetId,
        result: hideResult ? 'recorded' : e.result,
        locationId: e.locationId,
        geoAccuracyMeters: e.geoAccuracyMeters,
        scannedAt: e.scannedAt,
        capturedAt: e.capturedAt,
      },
    })),
  };
}

