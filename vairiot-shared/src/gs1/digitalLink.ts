import { Gs1Error } from './errors.js';
import { isValidIar, type TenantIdMode } from './identifier.js';

export const CANONICAL_HOST = 'id.gs1.org';
// Isomorphic module — no process.env here. The server passes its configured
// host explicitly; the default is the platform's public resolver.
export const DEFAULT_OPERATIONAL_HOST = 'id.vairiot.com';

export function assetDigitalLink(
  a: { mode: TenantIdMode; giai?: string | null; iar: string; tenantSlug: string },
  host: string = DEFAULT_OPERATIONAL_HOST,
): string {
  if (a.mode === 'GS1') {
    if (!a.giai) throw new Gs1Error('GS1_MODE_WITHOUT_GIAI', a.iar);
    return `https://${host}/8004/${a.giai}`;
  }
  return `https://${host}/t/${a.tenantSlug}/asset/${a.iar}`;
}

export function canonicalise(uri: string): string {
  const u = new URL(uri);
  if (!/^\/8004\//.test(u.pathname)) throw new Gs1Error('NOT_CANONICALISABLE', uri);
  const params = [...u.searchParams.entries()]
    .filter(([k]) => /^\d{2,4}$/.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://${CANONICAL_HOST}${u.pathname.replace(/\/$/, '')}${qs ? '?' + qs : ''}`;
}

const GIAI_PATH = /^\/8004\/(?<giai>[0-9A-Za-z!"%&'()*+,\-./:;<=>?_]{1,30})$/;
const INTERNAL_PATH = /^\/t\/(?<tenant>[a-z0-9-]{2,64})\/asset\/(?<iar>\d{12})$/;

/** Local, offline scan resolution. Never calls the network. */
export function parseAssetScan(raw: string):
  | { giai?: string; iar?: string; tenantSlug?: string }
  | null {
  const text = raw.trim();
  if (/^\d{12}$/.test(text) && isValidIar(text)) return { iar: text };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  const g = GIAI_PATH.exec(u.pathname);
  if (g?.groups?.giai) return { giai: g.groups.giai };
  const i = INTERNAL_PATH.exec(u.pathname);
  if (i?.groups && isValidIar(i.groups.iar)) {
    return { iar: i.groups.iar, tenantSlug: i.groups.tenant };
  }
  return null;
}

export function gs1128ElementString(a: {
  mode: TenantIdMode;
  giai?: string | null;
  iar: string;
}): string {
  return a.mode === 'GS1' ? `(8004)${a.giai}` : `(91)${a.iar}`;
}
