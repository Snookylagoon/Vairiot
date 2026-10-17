import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Router } from 'express';

import { apiSpec } from '../../lib/api-spec';
import { approvalsRouter } from '../../routes/approvals/approvals.router';
import { importsRouter } from '../../routes/imports/imports.router';

// Phase 2 plan §2.4 (D19): OpenAPI stays hand-written, with a contract test
// for the new routes — every staged-import and approvals route (stage 3.2) is
// documented, with its method.

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

it.each([['/imports', importsRouter, 11], ['/approvals', approvalsRouter, 8]] as const)('documents every %s route', (base, router, least) => {
  const routes = ((router as unknown as Router & { stack: Layer[] }).stack)
    .flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => [m, `${base}${l.route!.path === '/' ? '' : l.route!.path.replace(/:(\w+)/g, '{$1}')}`]) : []));
  expect(routes.length).toBeGreaterThanOrEqual(least);
  const paths = apiSpec.paths as Record<string, Record<string, unknown>>;
  for (const [method, path] of routes) expect([method, path, !!paths[path]?.[method]]).toEqual([method, path, true]);
});

it('carries the product version (bump-version.mjs sets it)', () => {
  const { version } = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as { version: string };
  expect(apiSpec.info.version).toBe(version);
});
