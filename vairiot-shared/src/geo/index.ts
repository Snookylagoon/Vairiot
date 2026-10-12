/**
 * GIS position for assets — WGS 84 decimal degrees (what GPS receivers,
 * browsers and every web map use). Isomorphic: server, browser, WebView.
 *
 * A position complements the descriptive site / location an asset already
 * carries; it never replaces it.
 */

/** How a position was captured. */
export const GEO_SOURCES = ['manual', 'device', 'import'] as const;
export type GeoSource = (typeof GEO_SOURCES)[number];

/** Six decimal places ≈ 0.11 m at the equator — finer than any GPS fix. */
export const GEO_DECIMALS = 6;

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export class GeoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GeoError';
    this.code = code;
  }
}

export function isGeoSource(v: unknown): v is GeoSource {
  return typeof v === 'string' && (GEO_SOURCES as readonly string[]).includes(v);
}

/** Rounds a coordinate to {@link GEO_DECIMALS} places. */
export function roundCoordinate(v: number): number {
  const f = 10 ** GEO_DECIMALS;
  return Math.round(v * f) / f;
}

/**
 * Validates a latitude / longitude pair and returns it rounded. Accepts
 * numbers or numeric strings (form fields, CSV cells).
 */
export function validateGeoPosition(latitude: unknown, longitude: unknown): GeoPosition {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  if (lat === null || lng === null) {
    throw new GeoError('GEO_NOT_A_NUMBER', 'Latitude and longitude must be numbers');
  }
  if (lat < -90 || lat > 90) {
    throw new GeoError('GEO_LATITUDE_RANGE', 'Latitude must be between -90 and 90');
  }
  if (lng < -180 || lng > 180) {
    throw new GeoError('GEO_LONGITUDE_RANGE', 'Longitude must be between -180 and 180');
  }
  return { latitude: roundCoordinate(lat), longitude: roundCoordinate(lng) };
}

/**
 * Pulls a "lat, lng" pair out of free text: a pasted pair ("41.7151, 44.8271"),
 * a Google Maps URL ("…/@41.7151,44.8271,17z" or "?q=41.7151,44.8271") or an
 * OpenStreetMap URL ("#map=17/41.7151/44.8271"). Outside OSM URLs both values
 * need a decimal point, so stray integers ("Room 12 34") aren't read as a
 * position. Returns null when there is no valid pair.
 */
export function parseCoordinates(text: string): GeoPosition | null {
  const osm = /#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(text);
  const pair = osm ?? /(?<![\d.])(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/.exec(text);
  if (!pair) return null;
  try {
    return validateGeoPosition(pair[1], pair[2]);
  } catch {
    return null;
  }
}

/** "41.715100, 44.827100" */
export function formatCoordinates(p: GeoPosition): string {
  return `${p.latitude.toFixed(GEO_DECIMALS)}, ${p.longitude.toFixed(GEO_DECIMALS)}`;
}

export function openStreetMapUrl(p: GeoPosition, zoom = 18): string {
  return `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=${zoom}/${p.latitude}/${p.longitude}`;
}

export function googleMapsUrl(p: GeoPosition): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
}

/**
 * Key-less OpenStreetMap embed with a marker on the position. `span` is the
 * half-width of the bounding box in degrees (0.002 ≈ a city block).
 */
export function openStreetMapEmbedUrl(p: GeoPosition, span = 0.002): string {
  const bbox = [
    Math.max(-180, p.longitude - span), Math.max(-90, p.latitude - span),
    Math.min(180, p.longitude + span), Math.min(90, p.latitude + span),
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.latitude},${p.longitude}`;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
