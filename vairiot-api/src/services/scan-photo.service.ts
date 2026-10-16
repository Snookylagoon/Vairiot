import { CampaignMode, GeoError, validateGeoPosition } from 'vairiot-shared';

import { NotFoundError, ValidationError } from '../lib/errors';
import { readJpegExifFacts } from '../lib/image-metadata/exif-read';
import { minioClient, PHOTO_BUCKET } from '../lib/minio';
import { prisma } from '../lib/prisma';

import { mimeToExt, randomHex } from './photo.service';
import { tenantFeatureEnabled } from './tenant-features.service';

// Photographic evidence bound to an audit scan (Phase 1 W3, stage 1.7).
// The stored original keeps its metadata as evidence; every download is
// stripped (KFR-043, decision D13 proposed).

export const SCAN_PHOTO_LIMIT = 4;
export const PHOTO_TYPES = ['inventory', 'condition', 'label', 'general'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export interface ScanPhotoInput {
  tenantId: string;
  campaignId: string;
  /** The scan's id, or the clientRequestId the device queued it under. */
  scanRef: string;
  actorId: string;
  buffer: Buffer;
  mimeType: string;
  thumbBuffer?: Buffer;
  thumbMimeType?: string;
  photoType?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  geoAccuracyMeters?: number | string | null;
  capturedAt?: string | null;
  deviceId?: string | null;
}

const scanPhotoSelect = {
  id: true, scanEventId: true, campaignId: true, assetId: true, photoType: true,
  latitude: true, longitude: true, geoAccuracyMeters: true, capturedAt: true,
  mimeType: true, sizeBytes: true, createdAt: true, createdBy: true, thumbStorageKey: true,
} as const;

function withHasThumb<T extends { thumbStorageKey: string | null }>(row: T) {
  const { thumbStorageKey, ...rest } = row;
  return { ...rest, hasThumb: thumbStorageKey != null };
}

/** Client position first, then the photo's EXIF, then the scan's own fix. */
function choosePosition(input: ScanPhotoInput, exif: ReturnType<typeof readJpegExifFacts>,
  scan: { latitude: number | null; longitude: number | null; geoAccuracyMeters: number | null }) {
  if (input.latitude != null && input.longitude != null) {
    try {
      const p = validateGeoPosition(input.latitude, input.longitude);
      const acc = input.geoAccuracyMeters == null ? null : Number(input.geoAccuracyMeters);
      return { ...p, geoAccuracyMeters: acc !== null && Number.isFinite(acc) && acc >= 0 ? acc : null };
    } catch (e) {
      if (!(e instanceof GeoError)) throw e;
    }
  }
  if (exif.latitude !== undefined && exif.longitude !== undefined) {
    return { latitude: exif.latitude, longitude: exif.longitude, geoAccuracyMeters: exif.accuracyMeters ?? null };
  }
  return { latitude: scan.latitude, longitude: scan.longitude, geoAccuracyMeters: scan.geoAccuracyMeters };
}

function chooseCapturedAt(raw: string | null | undefined, exif?: Date, scan?: Date | null): Date | null {
  const client = raw ? new Date(raw) : undefined;
  if (client && !Number.isNaN(client.getTime())) return client;
  return exif ?? scan ?? null;
}

async function findScan(tenantId: string, campaignId: string, scanRef: string) {
  const scan = await prisma.auditScanEvent.findFirst({
    where: { tenantId, campaignId, OR: [{ id: scanRef }, { clientRequestId: scanRef }] },
  });
  if (!scan) throw new NotFoundError('Scan not found');
  return scan;
}

export async function uploadScanPhoto(input: ScanPhotoInput) {
  const photoType = input.photoType ?? 'inventory';
  if (!(PHOTO_TYPES as readonly string[]).includes(photoType)) {
    throw new ValidationError(`photoType must be one of ${PHOTO_TYPES.join(', ')}`);
  }
  const scan = await findScan(input.tenantId, input.campaignId, input.scanRef);
  const count = await prisma.photo.count({ where: { tenantId: input.tenantId, scanEventId: scan.id } });
  if (count >= SCAN_PHOTO_LIMIT) throw new ValidationError(`Scan photo limit reached (max ${SCAN_PHOTO_LIMIT})`);

  const gis = await tenantFeatureEnabled(input.tenantId, 'gis');
  const exif = readJpegExifFacts(input.buffer);
  const position = gis ? choosePosition(input, exif, scan) : {};

  const base = `${input.tenantId}/scans/${scan.id}/${Date.now()}-${randomHex(8)}`;
  const storageKey = `${base}${mimeToExt(input.mimeType)}`;
  await minioClient.putObject(PHOTO_BUCKET, storageKey, input.buffer, input.buffer.length, { 'Content-Type': input.mimeType });
  let thumbStorageKey: string | undefined;
  if (input.thumbBuffer) {
    const thumbMime = input.thumbMimeType ?? input.mimeType;
    thumbStorageKey = `${base}_thumb${mimeToExt(thumbMime)}`;
    await minioClient.putObject(PHOTO_BUCKET, thumbStorageKey, input.thumbBuffer, input.thumbBuffer.length, { 'Content-Type': thumbMime });
  }

  const row = await prisma.photo.create({
    data: {
      tenantId: input.tenantId,
      assetId: scan.assetId,
      scanEventId: scan.id,
      campaignId: input.campaignId,
      photoType,
      ...position,
      capturedAt: chooseCapturedAt(input.capturedAt, exif.capturedAt, scan.capturedAt ?? scan.scannedAt),
      deviceId: input.deviceId ?? scan.deviceId,
      storageKey,
      thumbStorageKey,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      createdBy: input.actorId,
    },
    select: scanPhotoSelect,
  });
  return withHasThumb(row);
}

/**
 * A campaign's scan photos, optionally for one zone. Blind campaigns hide
 * the matched asset until completed, as the scans themselves do.
 */
export async function listCampaignPhotos(tenantId: string, campaignId: string, locationId?: string) {
  const c = await prisma.auditCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError('Campaign not found');
  const hide = c.mode === CampaignMode.Blind && c.status !== 'completed';
  const rows = await prisma.photo.findMany({
    where: { tenantId, campaignId, ...(locationId && { scanEvent: { locationId } }) },
    orderBy: { createdAt: 'asc' },
    select: { ...scanPhotoSelect, scanEvent: { select: { tagValue: true, locationId: true, result: true } } },
  });
  return rows.map((r) => {
    const { scanEvent, ...rest } = withHasThumb(r);
    return {
      ...rest,
      assetId: hide ? null : rest.assetId,
      tagValue: scanEvent?.tagValue ?? null,
      locationId: scanEvent?.locationId ?? null,
      result: hide ? 'recorded' : scanEvent?.result ?? null,
    };
  });
}
