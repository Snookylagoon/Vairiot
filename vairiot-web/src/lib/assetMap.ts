import type { AssetMapPoint } from '@/types';

/** Marker colour per asset status; anything unlisted uses `other`. */
export const STATUS_COLOURS = {
  active:      { label: 'Active',            colour: '#16a34a' },
  maintenance: { label: 'Under maintenance', colour: '#d97706' },
  in_repair:   { label: 'In repair',         colour: '#d97706' },
  in_storage:  { label: 'In storage',        colour: '#2563eb' },
  inactive:    { label: 'Inactive',          colour: '#6b7280' },
  lost:        { label: 'Lost',              colour: '#dc2626' },
  disposed:    { label: 'Disposed',          colour: '#9ca3af' },
  other:       { label: 'Other',             colour: '#615aa0' },
} as const;

export function statusColour(status: string): string {
  return (STATUS_COLOURS as Record<string, { colour: string }>)[status]?.colour ?? STATUS_COLOURS.other.colour;
}

/** Leaflet tooltips take HTML; asset names are user data. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** [[south, west], [north, east]] around the points, or null when there are none. */
export function boundsOf(points: Pick<AssetMapPoint, 'latitude' | 'longitude'>[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) {
    s = Math.min(s, p.latitude);  n = Math.max(n, p.latitude);
    w = Math.min(w, p.longitude); e = Math.max(e, p.longitude);
  }
  return [[s, w], [n, e]];
}
