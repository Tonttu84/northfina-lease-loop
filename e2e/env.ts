// The test database's environment, in one place for every process that opens it: the server
// under test (playwright.config.ts hands it to `next start` and to e2e/prepare-db.mjs) and the
// spec process (e2e/fixtures.ts puts it in its own `process.env` and in every script it runs).

/** The browser tests' own SQLite file, never dev.db; e2e/prepare-db.mjs refuses any other name. */
export const DATABASE_URL = 'file:./e2e.db';

/**
 * What every process that opens the test database gets. An empty AUDIT_ANCHOR_FILE keeps the
 * audit anchors beside e2e.db, so an anchor file a developer's shell points at for dev.db is never
 * written or deleted by a test run; CHECKPOINT_DISABLE keeps the Prisma CLI from phoning home.
 */
export const DATABASE_ENV = {
  DATABASE_URL,
  AUDIT_ANCHOR_FILE: '',
  CHECKPOINT_DISABLE: '1',
} as const;
