import { expect, test } from '@playwright/test';

// S1.4 gate on the Docker stack: sign in, open the map, and check that every
// positioned asset the API reports is drawn, clustered where they crowd.
//
//   E2E_BASE_URL=https://assets.example E2E_TENANT=tuda E2E_EMAIL=… E2E_PASSWORD=… \
//     npm run test:e2e:stack --workspace vairiot-web
//
// The tenant needs `gis` on and at least two positioned assets.
const { E2E_BASE_URL, E2E_TENANT, E2E_EMAIL, E2E_PASSWORD } = process.env;

test.skip(!E2E_BASE_URL || !E2E_TENANT || !E2E_EMAIL || !E2E_PASSWORD, 'Set E2E_BASE_URL, E2E_TENANT, E2E_EMAIL and E2E_PASSWORD');

test('the map shows the register as clustered markers', async ({ page }) => {
  // Stage 2.16 (G31): the console sends its Content-Security-Policy, and
  // signing in and drawing the map, tiles included, breaks none of it.
  const violations: string[] = [];
  page.on('console', m => { if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text()); });
  const first = await page.goto('/login');
  expect(first?.headers()['content-security-policy']).toMatch(/script-src 'self'/);
  // By placeholder: the form's labels are not tied to their inputs yet.
  await page.getByPlaceholder('Company name or ID').fill(E2E_TENANT!);
  await page.getByPlaceholder('you@example.com').fill(E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  const response = page.waitForResponse(r => r.url().includes('/api/v1/assets/map') && r.ok());
  await page.goto('/assets/map');
  const { total, assets } = await (await response).json() as { total: number; assets: unknown[] };
  expect(total).toBeGreaterThan(1);

  await expect(page.getByText(new RegExp(`^${total.toLocaleString('en')} assets? on the map`))).toBeVisible();
  await expect.poll(async () => {
    const clustered = (await page.locator('.leaflet-marker-pane .marker-cluster').allInnerTexts())
      .reduce((sum, c) => sum + Number(c.trim()), 0);
    return clustered + await page.locator('.leaflet-overlay-pane path.leaflet-interactive').count();
  }, { timeout: 15_000 }).toBe(assets.length);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 15_000 });
  expect(violations).toEqual([]);
});
