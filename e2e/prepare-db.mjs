// Builds the browser tests' database afresh, once per run, before `next start` opens it: the old
// e2e.db and its audit anchor file go, then the real migrations run with the Prisma CLI exactly
// as `npm run db:setup` does. The specs seed what they read per test (e2e/fixtures.ts), so no
// data-pack seed is needed here. Refuses any DATABASE_URL that is not an e2e file, so a wrong
// environment can never wipe dev.db. Run by playwright.config.ts; every child has a time limit.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^file:.*e2e\.db$/.test(databaseUrl)) {
  throw new Error(
    `DATABASE_URL must name an e2e SQLite file (file:./e2e.db), got "${databaseUrl}"`
  );
}

const file = path.resolve(databaseUrl.slice('file:'.length));
for (const stale of [file, `${file}-journal`, `${file}.anchors.jsonl`]) {
  rmSync(stale, { force: true });
}

const require = createRequire(import.meta.url);
const prisma = path.join(path.dirname(require.resolve('prisma/package.json')), 'build/index.js');
// CHECKPOINT_DISABLE skips Prisma's update check, a network call on every command.
execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: '1' },
  stdio: 'inherit',
  timeout: 120_000,
});
console.log(`🧪 Browser-test database ready: ${file}`);
