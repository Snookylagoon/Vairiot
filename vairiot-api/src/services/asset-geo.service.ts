import { GeoError, isGeoSource, validateGeoPosition, type GeoSource } from 'vairiot-shared';

import { ValidationError } from '../lib/errors';

import { tenantFeatureEnabled } from './tenant-features.service';

/** GIS fields a client may send on asset create / update. */
export interface AssetGeoInput {
  latitude?: number | string | null;
  longitude?: number | string | null;
  geoAccuracyMeters?: number | string | null;
  geoSource?: string | null;
  geoCapturedAt?: string | null;
}

export interface AssetGeoColumns {
  latitude: number | null;
  longitude: number | null;
  geoAccuracyMeters: number | null;
  geoSource: GeoSource | null;
  geoCapturedAt: Date | null;
}

const CLEARED: AssetGeoColumns = {
  latitude: null, longitude: null, geoAccuracyMeters: null, geoSource: null, geoCapturedAt: null,
};

/**
 * Turns request input into the asset's GIS columns, or `undefined` when the
 * position should be left as it is.
 *
 * - Neither coordinate sent → no change (accuracy / source alone are ignored).
 * - Both null or empty → position cleared, with its metadata.
 * - Both set → validated and stored; source defaults to `defaultSource`,
 *   captured-at to now. Re-sending the position an asset already has is a
 *   no-op, so a form that round-trips every field doesn't restamp it.
 * - Only one of the pair → 400.
 */
export function resolveAssetGeo(
  input: AssetGeoInput,
  existing?: { latitude: number | null; longitude: number | null } | null,
  defaultSource: GeoSource = 'manual',
): AssetGeoColumns | undefined {
  const { latitude, longitude } = input;
  if (latitude === undefined && longitude === undefined) return undefined;

  const latBlank = latitude == null || latitude === '';
  const lngBlank = longitude == null || longitude === '';
  if (latBlank && lngBlank) {
    const alreadyClear = existing != null && existing.latitude == null;
    return alreadyClear ? undefined : CLEARED;
  }
  if (latBlank || lngBlank) {
    throw new ValidationError('Latitude and longitude must be provided together');
  }

  let position;
  try {
    position = validateGeoPosition(latitude, longitude);
  } catch (e) {
    if (e instanceof GeoError) throw new ValidationError(e.message);
    throw e;
  }

  if (existing && existing.latitude === position.latitude && existing.longitude === position.longitude) {
    return undefined;
  }

  let accuracy: number | null = null;
  if (input.geoAccuracyMeters != null && input.geoAccuracyMeters !== '') {
    accuracy = Number(input.geoAccuracyMeters);
    if (!Number.isFinite(accuracy) || accuracy < 0) {
      throw new ValidationError('Position accuracy must be a non-negative number of metres');
    }
    accuracy = Math.round(accuracy * 10) / 10;
  }

  if (input.geoSource != null && !isGeoSource(input.geoSource)) {
    throw new ValidationError('Position source must be one of manual, device, import');
  }

  let capturedAt = new Date();
  if (input.geoCapturedAt) {
    capturedAt = new Date(input.geoCapturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new ValidationError('Position capture time must be an ISO 8601 date');
    }
  }

  return {
    ...position,
    geoAccuracyMeters: accuracy,
    geoSource: (input.geoSource as GeoSource | null | undefined) ?? defaultSource,
    geoCapturedAt: capturedAt,
  };
}

/**
 * `resolveAssetGeo` for a tenant: when GIS is switched off (D7), any position
 * sent is ignored rather than refused, so older app builds and queued offline
 * work still save. Stored positions are left untouched and reappear when GIS
 * is switched back on.
 */
export async function resolveTenantAssetGeo(
  tenantId: string,
  input: AssetGeoInput,
  existing?: { latitude: number | null; longitude: number | null } | null,
): Promise<AssetGeoColumns | undefined> {
  if (input.latitude === undefined && input.longitude === undefined) return undefined;
  if (!(await tenantFeatureEnabled(tenantId, 'gis'))) return undefined;
  return resolveAssetGeo(input, existing);
}
