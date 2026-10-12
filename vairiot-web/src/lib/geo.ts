import { isGeoSource, validateGeoPosition, type GeoPosition } from 'vairiot-shared';

import type { AssetFormData } from '@/lib/schemas';

/** The asset's position, or null when it has none. */
export function assetPosition(a: { latitude?: number | null; longitude?: number | null }): GeoPosition | null {
  return a.latitude != null && a.longitude != null ? { latitude: a.latitude, longitude: a.longitude } : null;
}

/** The form's position when both fields hold a valid pair, else null. */
export function formPosition(latitude?: string, longitude?: string): GeoPosition | null {
  if (!latitude?.trim() || !longitude?.trim()) return null;
  try {
    return validateGeoPosition(latitude, longitude);
  } catch {
    return null;
  }
}

/**
 * GIS fields for the asset API. Blank coordinates are sent as null so an edit
 * can clear a position; the API ignores a position it already holds.
 */
export function geoPayload(d: AssetFormData) {
  const position = formPosition(d.latitude, d.longitude);
  return {
    latitude:          position?.latitude ?? null,
    longitude:         position?.longitude ?? null,
    geoAccuracyMeters: position && d.geoAccuracyMeters ? Number(d.geoAccuracyMeters) : null,
    geoSource:         position ? (isGeoSource(d.geoSource) ? d.geoSource : 'manual') : null,
    geoCapturedAt:     position && d.geoCapturedAt ? d.geoCapturedAt : null,
  };
}
