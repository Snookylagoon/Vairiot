import { expect, test, type Page } from '@playwright/test';

import { CAMPAIGN, OUTLYING, REGISTER, mockApi } from './fixtures';

// S1.4 gate (test plan §8.2): the map shows the TUDA register as clustered
// markers, and choosing a campaign recolours them. Real Leaflet in a real
// browser; only the API is mocked.

const clusters = (page: Page) => page.locator('.leaflet-marker-pane .marker-cluster');
const singles = (page: Page) => page.locator('.leaflet-overlay-pane path.leaflet-interactive');

/** Assets drawn on the map: cluster counts plus the single markers. */
async function drawnAssets(page: Page): Promise<number> {
  const counts = await clusters(page).allInnerTexts();
  return counts.reduce((sum, c) => sum + Number(c.trim()), 0) + await singles(page).count();
}

test('the register loads as clustered markers', async ({ page }) => {
  const requests = await mockApi(page);
  await page.goto('/assets/map');

  await expect(page.getByRole('heading', { name: 'Asset Map' })).toBeVisible();
  await expect(page.getByText(`${REGISTER.length} assets on the map · 3 without a position`)).toBeVisible();

  // The avenue collapses into one cluster; the two outlying assets stay single.
  await expect(clusters(page)).toHaveCount(1);
  await expect(clusters(page)).toHaveText('40');
  await expect(singles(page)).toHaveCount(OUTLYING.length);
  expect(await drawnAssets(page)).toBe(REGISTER.length);

  // The tenant's base map was asked for, and tiles were drawn.
  expect(requests).toContain('GET /gis/map-settings');
  await expect(page.locator('.leaflet-tile-pane img').first()).toBeAttached();
});

test('a single marker opens the asset card', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/map');
  await expect(singles(page)).toHaveCount(OUTLYING.length);

  await singles(page).first().click();
  const card = page.getByRole('link', { name: 'Open asset' });
  await expect(card).toBeVisible();
  const href = await card.getAttribute('href');
  expect(OUTLYING.map(p => `/assets/${p.id}`)).toContain(href);
});

test('clicking a cluster zooms in and splits it', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/map');
  // Wait for the first fit to settle: while it animates, Leaflet briefly
  // draws two cluster icons, and a strict locator fails on two at once.
  await expect(clusters(page)).toHaveCount(1);
  await expect(clusters(page)).toHaveText('40');

  await clusters(page).click();
  // Zoomed to the avenue: the 40 break into smaller clusters or markers
  // (off-screen outliers are no longer drawn, so only the avenue counts).
  await expect.poll(async () => {
    const counts = (await clusters(page).allInnerTexts()).map(c => Number(c.trim()));
    return { whole: counts.includes(40), drawn: await drawnAssets(page) };
  }, { timeout: 10_000 }).toEqual({ whole: false, drawn: 40 });
});

test('choosing a campaign recolours the markers by count state', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/map');
  await expect(singles(page)).toHaveCount(OUTLYING.length);
  const registerFills = await singles(page).evaluateAll(els => els.map(e => e.getAttribute('fill')));

  await page.getByRole('combobox', { name: 'Campaign' }).selectOption(CAMPAIGN.id);

  await expect(page).toHaveURL(new RegExp(`campaign=${CAMPAIGN.id}`));
  await expect(page.getByText(`${CAMPAIGN.name}: ${REGISTER.length} on the map`)).toBeVisible();
  const legend = page.getByLabel('Legend');
  await expect(legend).toContainText('Verified');
  await expect(legend).toContainText('Not yet scanned');

  // Kutaisi verified (green), Batumi missing (red).
  await expect.poll(async () => (await singles(page).evaluateAll(els => els.map(e => e.getAttribute('fill')))).sort())
    .toEqual(['#16a34a', '#dc2626']);
  expect(registerFills).not.toEqual(['#16a34a', '#dc2626']);
});

test('with GIS off the map is not offered', async ({ page }) => {
  await mockApi(page, { featureFlags: {} });
  await page.goto('/assets/map');
  await expect(page).toHaveURL(/\/assets$/);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});
