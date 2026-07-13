import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts'],
  fullyParallel: false,
  // GPU-heavy browser scenes become timing-invalid when too many software
  // graphics contexts compete on the same validation machine.
  workers: 1,
  retries: 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/visual/__snapshots__/{projectName}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['visual/**/*.spec.ts'],
    },
    {
      name: 'chromium-webgl2',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['e2e/full-flow.spec.ts', 'visual/**/*.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: ['e2e/full-flow.spec.ts'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: ['e2e/full-flow.spec.ts'],
    },
  ],
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
