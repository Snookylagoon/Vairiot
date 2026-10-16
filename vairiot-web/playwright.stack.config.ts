import { defineConfig, devices } from '@playwright/test';

// Browser smoke against a running Docker stack behind nginx (stage 1.21, G30):
// the real API, database and map, signed in as a real user. Used for the phase
// exit gate and before a release; see e2e/asset-map.stack.ts for the settings.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.stack.ts',
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // Gate stacks run on self-signed certificates.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
