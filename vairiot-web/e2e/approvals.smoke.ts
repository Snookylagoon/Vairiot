import { expect, test, type Route } from '@playwright/test';

import { tudaAdmin } from './fixtures';

// Phase 3, S3.1 (stage 3.3): Finance sees a disposal request in the header
// badge and the inbox, approves it, and the badge clears — in a real browser
// against a mocked API.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('Finance approves a disposal from the inbox', async ({ page }) => {
  const request = {
    id: 'r1', action: 'DISPOSE', status: 'PENDING', assetId: 'a1', entityType: 'Asset', entityId: 'a1',
    payload: { assetId: 'a1', disposalMethod: 'SCRAPPED' }, amount: '988.10', summary: 'Dispose of SGN-001 Sign (SCRAPPED)',
    requestedBy: 'operator', requestedByName: 'Nino', decidedBy: null, decidedByName: null, decidedAt: null, reason: null, error: null,
    approverRole: 'Finance', canDecide: true, createdAt: '2026-10-17T09:00:00Z',
  };
  let pending = [request];
  await page.route('http://api.e2e.invalid/**', (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/me') {
      return json(route, { ...tudaAdmin({ ipsas: true }), userId: 'finance-e2e', roles: ['Finance'], permissions: ['asset:read', 'approval:read', 'approval:decide', 'accounting:approve'] });
    }
    if (path === '/approvals/inbox') return json(route, { requests: pending, runs: [], impairments: [], count: pending.length });
    if (path === '/approvals/r1/approve') { pending = []; return json(route, { ...request, status: 'APPROVED', canDecide: false }); }
    return json(route, []);
  });
  await page.addInitScript(() => {
    localStorage.setItem('vairiot_access_token', 'e2e-access');
    localStorage.setItem('vairiot_refresh_token', 'e2e-refresh');
  });
  await page.goto('/approvals');

  await expect(page.getByLabel('1 waiting for your approval')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  const card = page.getByLabel('Request: Dispose of SGN-001 Sign (SCRAPPED)');
  await expect(card.getByLabel('What will change')).toContainText('SCRAPPED');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();
  await expect(page.getByLabel('Approvals: nothing waiting')).toBeVisible();
});
