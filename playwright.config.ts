import { defineConfig, devices } from '@playwright/test';

const backendApiUrl = process.env['VITE_BACKEND_API_URL'] ?? 'http://127.0.0.1:4000';
const backendFeatureEnv = {
  VITE_BACKEND_API_URL: backendApiUrl,
  VITE_FEATURE_USE_BACKEND_BUILDER: 'true',
  VITE_FEATURE_USE_BACKEND_SCHEDULING: 'true',
  VITE_FEATURE_USE_BACKEND_DELIVERY: 'true',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    env: {
      ...process.env,
      ...backendFeatureEnv,
    },
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
  },
  workers: 1,
});
