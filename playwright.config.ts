import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', launchOptions: executablePath ? { executablePath } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} } }],
  webServer: {
    // Requires a prior `pnpm build`.
    command: `tsx --conditions=react-server scripts/e2e-prepare.ts && node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}/about`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: process.env.E2E_PG_URL || 'pglite:.data/e2e-db', ...(process.env.E2E_PG_URL ? { E2E_PG_URL: process.env.E2E_PG_URL } : {}), NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`, E2E_DB_DIR: '.data/e2e-db', ALLOW_SELF_REVIEW: 'false' },
  },
});
