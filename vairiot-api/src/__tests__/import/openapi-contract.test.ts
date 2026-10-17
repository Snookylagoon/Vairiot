import type { Router } from 'express';

import { apiSpec } from '../../lib/api-spec';
import { importsRouter } from '../../routes/imports/imports.router';

// Phase 2 plan §2.4: OpenAPI stays hand-written, with a contract test for the
// new routes — every staged-import route is documented, with its method.

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

it('documents every staged-import route', () => {
  const routes = ((importsRouter as unknown as Router & { stack: Layer[] }).stack)
    .flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => [m, `/imports${l.route!.path === '/' ? '' : l.route!.path.replace(/:(\w+)/g, '{$1}')}`]) : []));
  expect(routes.length).toBeGreaterThanOrEqual(11);
  const paths = apiSpec.paths as Record<string, Record<string, unknown>>;
  for (const [method, path] of routes) expect([method, path, !!paths[path]?.[method]]).toEqual([method, path, true]);
});
