import { expect, test, type Page, type Route } from '@playwright/test';

import { tudaAdmin } from './fixtures';

// Phase 2 exit gate (plan §3, Playwright): the Periods page prepares, posts and
// reverses a run, and the import wizard reaches the review step, in a real
// browser against a mocked API that keeps state like the worker would.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const finance = () => ({
  ...tudaAdmin({ gis: true, ipsas: true }), userId: 'finance-e2e', roles: ['Finance'],
  permissions: ['asset:read', 'asset:write', 'accounting:read', 'accounting:write', 'accounting:approve'],
});

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('vairiot_access_token', 'e2e-access');
    localStorage.setItem('vairiot_refresh_token', 'e2e-refresh');
  });
}

test('the Periods page prepares, posts and reverses a run', async ({ page }) => {
  const preview = { byClass: [{ classCode: 'SGN', count: 12, charge: '142.80' }], skipped: { not_recognised: 2 } };
  const run = (over: Record<string, unknown>) => ({
    id: 'run-oct', status: 'DRAFT', assetCount: 12, totalCharge: '142.8', preview, preparedBy: 'someone-else', postedBy: null, postedAt: null,
    reversalOfRunId: null, createdAt: '', jobState: 'DONE', pendingAction: null, jobError: null, ...over,
  });
  let runs: unknown[] = [];
  let status = 'OPEN';
  const calls: string[] = [];
  await page.route('http://api.e2e.invalid/**', (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname.replace(/^\/api\/v1/, '');
    calls.push(`${r.method()} ${path}`);
    if (path === '/auth/me') return json(route, finance());
    if (path === '/accounting/periods' && r.method() === 'GET') return json(route, [{ id: 'p-oct', year: 2026, month: 10, status, runs }]);
    if (path === '/accounting/periods/p-oct/runs') { runs = [run({ preparedBy: 'someone-else' })]; return json(route, runs[0], 202); }
    if (path === '/accounting/runs/run-oct/post') { runs = [run({ status: 'POSTED', postedBy: 'finance-e2e' })]; status = 'CLOSED'; return json(route, runs[0], 202); }
    if (path === '/accounting/runs/run-oct/reverse') {
      runs = [run({ id: 'run-rev', status: 'POSTED', reversalOfRunId: 'run-oct', totalCharge: '-142.8' }), run({ status: 'REVERSED' })];
      return json(route, runs[1], 202);
    }
    if (path === '/accounting/depreciation-by-class') return json(route, { period: null, rows: [], totals: {} });
    return json(route, []);
  });
  await signIn(page);
  await page.goto('/accounting/periods');

  await expect(page.getByRole('heading', { name: 'Periods and depreciation' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare run' }).click();
  await expect(page.getByText('SGN · 12 assets')).toBeVisible();
  await expect(page.getByText(/Left out: 2 not recognised/)).toBeVisible();

  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByLabel('Run posted')).toBeVisible();
  await page.getByRole('button', { name: 'Reverse' }).click();
  await page.getByLabel('Reason for the reversal').fill('Wrong usage figures');
  await page.getByRole('button', { name: 'Reverse run' }).click();
  await expect(page.getByLabel('Run reversed')).toBeVisible();
  expect(calls).toEqual(expect.arrayContaining(['POST /accounting/periods/p-oct/runs', 'POST /accounting/runs/run-oct/post', 'POST /accounting/runs/run-oct/reverse']));
});

test('the import wizard uploads a register, maps it and reaches the review', async ({ page }) => {
  const base = { id: 'b-e2e', fileName: 'tuda-register.xlsx', mode: 'CREATE', columns: ['დასახელება', 'Стоимость', 'Asset Class', 'Inv. No'], mapping: null,
    rowCount: 3, validCount: 0, warningCount: 0, errorCount: 0, committedCount: 0, jobError: null, createdAt: '' };
  let batch: Record<string, unknown> | null = null;
  let mapped: unknown = null;
  await page.route('http://api.e2e.invalid/**', (route) => {
    const r = route.request();
    const url = new URL(r.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/me') return json(route, finance());
    if (path === '/imports' && r.method() === 'POST') { batch = { ...base, status: 'PARSED' }; return json(route, { ...base, status: 'PARSING' }, 202); }
    if (path === '/imports' && r.method() === 'GET') return json(route, batch ? [batch] : []);
    if (path === '/imports/b-e2e/mapping') {
      mapped = JSON.parse(r.postData() ?? '{}');
      batch = { ...base, status: 'VALIDATED', mapping: (mapped as { mapping: unknown }).mapping, validCount: 2, errorCount: 1 };
      return json(route, { ...batch, status: 'VALIDATING' }, 202);
    }
    if (path === '/imports/b-e2e') return json(route, batch);
    if (path === '/imports/b-e2e/rows') {
      const rows = url.searchParams.get('status') === 'ERROR'
        ? [{ id: 'r3', rowNumber: 4, raw: { 'დასახელება': 'ბოძი', 'Стоимость': 'много', 'Asset Class': 'SGN', 'Inv. No': 'INV-3' }, status: 'ERROR', messages: [{ level: 'error', message: 'Стоимость: "много" is not a number' }], assetId: null }]
        : [];
      return json(route, { rows, total: rows.length, page: 1, pageSize: 50 });
    }
    return json(route, []);
  });
  await signIn(page);
  await page.goto('/import');

  await page.getByLabel('Register file').setInputFiles({ name: 'tuda-register.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK') });
  await page.getByRole('button', { name: /Upload/ }).click();
  // Georgian and Russian headers are recognised from the first guess.
  await expect(page.getByLabel('Column for Asset name')).toHaveValue('დასახელება');
  await expect(page.getByLabel('Column for Purchase cost')).toHaveValue('Стоимость');
  await expect(page.getByLabel('Column for Legacy asset number')).toHaveValue('Inv. No');
  await page.getByRole('button', { name: 'Check the rows' }).click();

  await expect(page.getByText('Стоимость: "много" is not a number')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 2 assets' })).toBeEnabled();
  expect((mapped as { mapping: { fields: Record<string, string> } }).mapping.fields).toMatchObject({ name: 'დასახელება', classCode: 'Asset Class' });
});
