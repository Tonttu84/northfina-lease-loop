// One `test` for every spec. Before each test the database is emptied with the Vitest suite's
// own `resetDb` and reseeded with the real seed script (docs/features/test-isolation.md, D44
// rule 1), so no spec reads another spec's rows and the demo cards always run on a fresh
// database (D70). Two more fixtures set the cookies the way a visitor would, through the real
// routes: who is acting (`actAs`) and the demo clock (`travelTo`).
//
// This process is plain Node, not Next: it imports nothing from the server slices, whose
// `authorize` → `actor` chain reaches `next/headers`, which only exists inside Next. The seed
// runs as a child process under tsx, exactly as `prisma db seed` runs it.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { createPrismaClient, type PrismaClient } from '../src/server/prisma-client';
import { resetDb } from '../tests/helpers/reset-db';
import { DATABASE_ENV, DATABASE_URL } from './env';

// The spec process reads the shell, not .env: it gets the database environment the server gets,
// so an AUDIT_ANCHOR_FILE exported for dev.db is never the file `resetDb` deletes before a test.
Object.assign(process.env, DATABASE_ENV);

/**
 * The seeded company signatories' first valid day. `prisma/seed.ts` seeds the real day, which
 * is after every card's day once the hackathon is over, so on the demo clock the mandates would
 * read as not yet valid (the polish review's bug 10); the fixture moves them to a fixed day
 * before every card.
 */
export const SIGNATORIES_VALID_FROM = '2026-01-01';

type Fixtures = {
  /** The test database, emptied and seeded before every test. Automatic: no spec needs to ask. */
  db: PrismaClient;
  /** Sets the "continue as" cookie through POST /api/actor (null: DELETE, nobody). */
  actAs: (actor: string | null) => Promise<void>;
  /** Sets the demo clock through POST /api/demo/clock (null: back to the real day). */
  travelTo: (day: string | null) => Promise<void>;
};

let client: PrismaClient | undefined;

/** `node_modules/.bin/tsx` without the shell wrapper, so Node runs it the same way everywhere. */
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');

/** Runs a repository script under tsx against the test database, with a time limit (rule 11). */
function runScript(script: string): void {
  execFileSync(process.execPath, [TSX, script], {
    env: { ...process.env, ...DATABASE_ENV },
    stdio: 'pipe',
    timeout: 60_000,
  });
}

export const test = base.extend<Fixtures>({
  db: [
    async ({ page: _page }, use) => {
      client ??= createPrismaClient(DATABASE_URL);
      await resetDb(client);
      runScript('prisma/seed.ts');
      await client.companySignatory.updateMany({
        data: { granted_on: SIGNATORIES_VALID_FROM, valid_from: SIGNATORIES_VALID_FROM },
      });
      await use(client);
    },
    { auto: true },
  ],
  actAs: async ({ page }, use) => {
    await use(async (actor) => {
      const response =
        actor === null
          ? await page.request.delete('/api/actor')
          : await page.request.post('/api/actor', { data: { actor } });
      expect(response.ok(), `actor ${actor}: ${response.status()}`).toBeTruthy();
    });
  },
  travelTo: async ({ page }, use) => {
    await use(async (day) => {
      const response = await page.request.post('/api/demo/clock', { data: { asOf: day } });
      expect(response.ok(), `clock ${day}: ${response.status()}`).toBeTruthy();
    });
  },
});

export { expect };

/**
 * Clicks a card's Run button and waits for the run to end: the server quotes, applies, signs and
 * writes the invoices and the signed audit rows, which on a slow runner takes longer than one
 * expectation's five seconds. The button is disabled while the card runs and enabled again once
 * the answer is in, so a spec reads the outcome only after that.
 */
export async function runCard(page: Page, cardId: number): Promise<void> {
  const button = page.getByRole('button', { name: `Run card ${cardId}`, exact: true });
  const answered = page.waitForResponse(
    (response) => response.url().endsWith(`/api/demo/cards/${cardId}/run`),
    { timeout: 30_000 }
  );
  await button.click();
  await answered;
  await expect(button).toBeEnabled({ timeout: 30_000 });
}

/** A money string as the page writes it; fi, sv and et put a no-break space before the €. */
export const money = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '[\\s\\u00a0\\u202f]'));

/**
 * Runs `npm run demo:tamper` the way the pitch does, against the test database: the tamper
 * script edits an audit row straight in the SQLite file.
 */
export function tamperAuditLog(): void {
  runScript('scripts/tamper-audit.mjs');
}
