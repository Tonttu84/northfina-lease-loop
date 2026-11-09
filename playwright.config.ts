import { defineConfig, devices } from '@playwright/test';
import { DATABASE_ENV } from './e2e/env';

// Browser tests on a built app (`next start`) against its own SQLite file, e2e.db, never dev.db
// (docs/features/e2e-tests.md). One worker, no parallel files: every spec empties and reseeds
// the database it reads (D44 rule 1), and the server is the other connection to the same file.
// The demo tools are on (D74) so the Run buttons answer; the database environment set here
// (e2e/env.ts) wins over .env, because Next and prisma.config.ts never overwrite a variable
// already in the environment.
const PORT = 3100;
const CI = !!process.env.CI;
// CI has built the app in the step before; locally the run builds it first unless told not to.
const skipBuild = CI || process.env.E2E_SKIP_BUILD === '1';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky spec is a bug; CI shows it
  forbidOnly: CI,
  timeout: 60_000, // a test runs at most one card, several seconds on a slow runner, and a page or two
  globalTimeout: 15 * 60_000, // AGENTS.md rule 11: every loop ends
  expect: { timeout: 5_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The database is built before the server opens it: Playwright starts the web server before
    // globalSetup runs, so the preparation is the first part of the server command.
    command: [
      // The session secret and the audit key into .env when missing (D92): `npx next start`
      // runs no `prestart`.
      'node scripts/ensure-env.mjs',
      'node e2e/prepare-db.mjs',
      ...(skipBuild ? [] : ['npm run build']),
      `npx next start -p ${PORT}`,
    ].join(' && '),
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: false,
    timeout: skipBuild ? 120_000 : 600_000,
    env: { ...DATABASE_ENV, DEMO_TOOLS: '1', PORT: String(PORT) },
  },
});
