import { ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

/** A WGS 84 bounding box: west, south, east, north. */
export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export const GEO_DEFAULT_LIMIT = 1000;
export const GEO_MAX_LIMIT = 5000;

/**
 * Parses `bbox=minLon,minLat,maxLon,maxLat` (the GeoJSON / OGC order). Boxes
 * that cross the antimeridian are not supported: none of our tenants need it.
 */
export function parseBbox(raw: unknown): BBox {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ValidationError('bbox is required as minLon,minLat,maxLon,maxLat');
  }
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ValidationError('bbox must be four numbers: minLon,minLat,maxLon,maxLat');
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  const lonOk = (n: number) => n >= -180 && n <= 180;
  const latOk = (n: number) => n >= -90 && n <= 90;
  if (!lonOk(minLon) || !lonOk(maxLon) || !latOk(minLat) || !latOk(maxLat)) {
    throw new ValidationError('bbox is outside longitude −180..180 or latitude −90..90');
  }
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new ValidationError('bbox minimum must be below its maximum on both axes');
  }
  return { minLon, minLat, maxLon, maxLat };
}

export function parseGeoLimit(raw: unknown): number {
  if (raw === undefined || raw === '') return GEO_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > GEO_MAX_LIMIT) {
    throw new ValidationError(`limit must be a whole number from 1 to ${GEO_MAX_LIMIT}`);
  }
  return n;
}

interface GeoRow {
  id: string;
  assetNumber: string;
  name: string;
  status: string;
  condition: string;
  latitude: number;
  longitude: number;
  geoAccuracyMeters: number | null;
  geoSource: string | null;
  siteId: string | null;
}

/**
 * The tenant's live assets inside the box, as a GeoJSON FeatureCollection.
 * Uses the GIST index on `geom` (ST_Intersects). `truncated` says the limit
 * cut the result short, so a client can zoom in rather than miss assets.
 */
export async function listAssetsInBbox(tenantId: string, bbox: BBox, limit: number) {
  const rows = await prisma.$queryRaw<GeoRow[]>`
    SELECT "id", "assetNumber", "name", "status", "condition", "latitude", "longitude",
           "geoAccuracyMeters", "geoSource", "siteId"
    FROM "assets"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND "geom" IS NOT NULL
      AND ST_Intersects(
        "geom",
        ST_MakeEnvelope(${bbox.minLon}::float8, ${bbox.minLat}::float8,
                        ${bbox.maxLon}::float8, ${bbox.maxLat}::float8, 4326)::geography)
    ORDER BY "assetNumber"
    LIMIT ${limit + 1}`;

  const truncated = rows.length > limit;
  return {
    type: 'FeatureCollection' as const,
    truncated,
    features: rows.slice(0, limit).map((r) => ({
      type: 'Feature' as const,
      id: r.id,
      geometry: { type: 'Point' as const, coordinates: [r.longitude, r.latitude] },
      properties: {
        assetNumber: r.assetNumber,
        name: r.name,
        status: r.status,
        condition: r.condition,
        siteId: r.siteId,
        geoAccuracyMeters: r.geoAccuracyMeters,
        geoSource: r.geoSource,
      },
    })),
  };
}
