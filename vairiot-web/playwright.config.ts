import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests (stage 1.20, G30). The API is mocked in each test with
// page.route, so the web app runs alone: no database, no Docker stack.
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.smoke.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Requests go to a host that does not exist; every test routes them.
    env: { VITE_API_URL: 'http://api.e2e.invalid' },
  },
});
