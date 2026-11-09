import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// docs/features/test-isolation.md (D37).
const domainTests = ['src/domain/**/*.test.ts'];

// The audit log's signing key for this run (D81): fresh every run, so no key is ever written in
// the repository. withAudit refuses to write without one.
const testSigningKey = generateKeyPairSync('ed25519')
  .privateKey.export({ format: 'der', type: 'pkcs8' })
  .toString('base64');

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // AUDIT_ANCHOR_FILE emptied (review of #69, finding 6): set in the shell, every test database
    // would append to that one file and every reset would delete it.
    // The actor cookie's secret (D92) the same way: fresh every run, never in the repository.
    env: {
      AUDIT_SIGNING_KEY: testSigningKey,
      AUDIT_ANCHOR_FILE: '',
      SESSION_SECRET: randomBytes(32).toString('base64url'),
    },
    globalSetup: ['./tests/global-setup.ts'],
    // Files run in parallel: each DB test file copies its own SQLite file (tests/helpers/test-db.ts)
    // and `isolate` gives each file its own module graph, so its own event-handler registry.
    fileParallelism: true,
    isolate: true,
    coverage: {
      provider: 'v8',
      // Business logic and server code must stay tested; UI pages are not measured.
      include: ['src/domain/**', 'src/server/**', 'src/data/**', 'src/i18n/**'],
      exclude: ['**/*.test.ts', '**/*.json', '**/*.md'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
    },
    projects: [
      {
        // Pure functions: shuffled, files and tests, to prove no test leans on another's order.
        // A failure prints its seed; rerun with `--sequence.seed=<seed>` and fix the test.
        extends: true,
        test: { name: 'domain', include: domainTests, sequence: { shuffle: true } },
      },
      {
        // Database and file tests: tests inside a file run in the order written.
        extends: true,
        test: {
          name: 'server',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'tests/**/*.test.ts'],
          // e2e/ holds the Playwright specs (docs/features/e2e-tests.md): another runner, never Vitest.
          exclude: [...configDefaults.exclude, ...domainTests, 'e2e/**'],
        },
      },
    ],
  },
});
