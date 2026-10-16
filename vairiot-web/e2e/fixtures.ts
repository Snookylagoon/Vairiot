import type { Page, Route } from '@playwright/test';

/**
 * A mocked API for the browser smoke tests: a TUDA administrator and a
 * register of Tbilisi street assets. The TUDA seed creates the tenant but no
 * assets, so the positions here stand in for the field register.
 */

export const TUDA_TENANT_ID = 'tuda-e2e';

export function tudaAdmin(featureFlags: Record<string, boolean> = { gis: true }) {
  return {
    userId: 'user-e2e', email: 'admin@tuda.example', tenantId: TUDA_TENANT_ID,
    tenantName: 'Tbilisi Urban Development Agency', currency: 'GEL',
    roles: ['Administrator'], permissions: ['asset:read', 'asset:write', 'audit:read', 'company:manage'],
    featureFlags, twoFactorSetupDueBy: null,
  };
}

interface Point { id: string; name: string; status: string; latitude: number; longitude: number }

const point = (p: Point) => ({
  ...p, assetNumber: `TUDA-${p.id}`, condition: 'good', geoAccuracyMeters: 4,
  category: { id: 'cat-signs', name: 'Road signs' }, site: { id: 'site-tbilisi', name: 'Tbilisi' }, location: null,
});

/** 40 signs along Rustaveli Avenue, close enough to cluster at the fitted zoom. */
export const RUSTAVELI = Array.from({ length: 40 }, (_, i) => point({
  id: `R${String(i + 1).padStart(3, '0')}`, name: `Rustaveli sign ${i + 1}`, status: i % 7 === 0 ? 'inactive' : 'active',
  latitude: 41.6990 + i * 0.00008, longitude: 44.7980 + i * 0.00006,
}));

/** Two outlying assets, far enough apart to stay single markers. */
export const OUTLYING = [
  point({ id: 'K001', name: 'Kutaisi depot gate', status: 'active', latitude: 42.2679, longitude: 42.6946 }),
  point({ id: 'B001', name: 'Batumi boulevard light', status: 'active', latitude: 41.6510, longitude: 41.6360 }),
];

export const REGISTER = [...RUSTAVELI, ...OUTLYING];

export const CAMPAIGN = { id: 'audit-e2e', name: 'Rustaveli sign count', mode: 'standard', status: 'in_progress' };

/** The campaign layer: the outlying assets verified and missing, the avenue not yet scanned. */
export const CAMPAIGN_POINTS = [
  ...RUSTAVELI.map(p => ({ ...campaignPoint(p), state: 'not_scanned' })),
  { ...campaignPoint(OUTLYING[0]), state: 'verified' },
  { ...campaignPoint(OUTLYING[1]), state: 'missing' },
];

function campaignPoint(p: ReturnType<typeof point>) {
  return {
    id: `snap-${p.id}`, assetId: p.id, assetNumber: p.assetNumber, name: p.name,
    latitude: p.latitude, longitude: p.longitude, geoAccuracyMeters: p.geoAccuracyMeters, positionSource: 'register',
  };
}

// A 1×1 transparent PNG for every map tile, so no test reaches a tile server.
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Signs in as the TUDA administrator and answers every API call the map makes. */
export async function mockApi(page: Page, opts: { featureFlags?: Record<string, boolean> } = {}) {
  const requests: string[] = [];

  await page.route(/\/\/[^/]*tile[^/]*\/\d+\/\d+\/\d+/, route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));

  await page.route('http://api.e2e.invalid/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    requests.push(`${route.request().method()} ${path}${url.search}`);

    if (path === '/auth/me') return json(route, tudaAdmin(opts.featureFlags));
    if (path === '/assets/map') {
      return json(route, { assets: REGISTER, total: REGISTER.length, truncated: false, unplaced: 3 });
    }
    if (path === '/gis/map-settings') {
      return json(route, {
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors',
        centreLatitude: 41.7151, centreLongitude: 44.8271, zoom: 12,
      });
    }
    if (path === '/audits') return json(route, [CAMPAIGN, { id: 'audit-draft', name: 'Draft count', status: 'draft' }]);
    if (path === `/audits/${CAMPAIGN.id}/map`) {
      return json(route, {
        campaign: CAMPAIGN, points: CAMPAIGN_POINTS, unplaced: 0,
        counts: { verified: 1, missing: 1, not_scanned: 40, misplaced: 0, condition_variance: 0, surplus: 0, scanned: 0 },
      });
    }
    if (path === '/categories') return json(route, [{ id: 'cat-signs', name: 'Road signs' }]);
    if (path === '/sites') return json(route, [{ id: 'site-tbilisi', name: 'Tbilisi' }]);
    // Shell calls the map does not depend on (alerts, licence banners, …).
    return json(route, []);
  });

  await page.addInitScript(() => {
    localStorage.setItem('vairiot_access_token', 'e2e-access');
    localStorage.setItem('vairiot_refresh_token', 'e2e-refresh');
  });

  return requests;
}
