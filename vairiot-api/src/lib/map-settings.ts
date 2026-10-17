import { z } from 'zod';

// Per-tenant base map (Phase 1 W4, stage 1.12). TUDA may supply its own tile
// server; everyone else gets OpenStreetMap.

export const DEFAULT_MAP_SETTINGS = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  centreLatitude: 20,
  centreLongitude: 0,
  zoom: 2,
} as const;

export const MapSettingsSchema = z.object({
  tileUrl: z.string().max(500)
    .refine((u) => /^https:\/\/[^\s<>"']+$/.test(u), 'Tile URL must be an https address')
    .refine((u) => ['{z}', '{x}', '{y}'].every((t) => u.includes(t)), 'Tile URL must contain {z}, {x} and {y}'),
  // Leaflet renders attribution as HTML, so only plain text is accepted.
  attribution: z.string().min(1).max(300).refine((a) => !/[<>]/.test(a), 'Attribution must be plain text'),
  centreLatitude: z.number().min(-90).max(90),
  centreLongitude: z.number().min(-180).max(180),
  zoom: z.number().int().min(1).max(19),
});

export type MapSettings = z.infer<typeof MapSettingsSchema>;

/** Stored settings over the defaults; anything invalid falls back to the default. */
export function resolveMapSettings(raw: unknown): MapSettings {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const merged = { ...DEFAULT_MAP_SETTINGS, ...stored };
  const parsed = MapSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_MAP_SETTINGS };
}

// The web console's Content-Security-Policy allows map tiles only from the
// origins in CSP_TILE_HOSTS (W7, G31, stage 2.16): space-separated, such as
// "https://tile.openstreetmap.org https://*.tiles.tuda.gov.ge". A tile URL is
// refused when saved unless its origin is one of them, so a map is never
// blank because of the header. A {s} subdomain placeholder needs a *. entry.
export const DEFAULT_TILE_HOSTS = 'https://tile.openstreetmap.org';

export function tileHostAllowed(tileUrl: string, hosts = process.env.CSP_TILE_HOSTS || DEFAULT_TILE_HOSTS): boolean {
  const host = /^https:\/\/([^/:?#]+)/i.exec(tileUrl)?.[1]?.toLowerCase();
  if (!host) return false;
  return hosts.split(/\s+/).filter(Boolean).some((source) => {
    const m = /^https:\/\/([^/:]+)$/i.exec(source.replace(/\/$/, ''));
    if (!m) return false;
    const allowed = m[1].toLowerCase();
    if (allowed.startsWith('*.')) return host.endsWith(allowed.slice(1));
    return host === allowed;
  });
}
