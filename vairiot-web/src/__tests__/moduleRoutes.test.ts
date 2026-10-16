import { readFileSync } from 'fs';
import path from 'path';

import { MODULES } from 'vairiot-shared';
import { describe, expect, it } from 'vitest';

// Every web path the module registry lists (D7, stage 2.2) is wrapped in
// RequireFeature for its module in App.tsx, so a switched-off module's
// screens redirect instead of rendering.

const app = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('module routes in App.tsx', () => {
  for (const m of MODULES) {
    for (const route of m.webRoutes) {
      it(`${route} needs ${m.key}`, () => {
        const line = app.split('\n').find((l) => l.includes(`path="${route.slice(1)}"`));
        expect(line, `no <Route path="${route.slice(1)}">`).toBeDefined();
        expect(line).toContain(`<RequireFeature flag="${m.key}"`);
      });
    }
  }
});
