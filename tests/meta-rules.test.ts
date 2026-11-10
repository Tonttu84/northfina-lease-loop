// Meta rules: checks the repository itself against RULES.md and AGENTS.md, so `npm test`
// (pre-push hook and CI) fails as soon as someone breaks one. ESLint and the scripts in
// scripts/ enforce some of these too; this file is the belt to their braces.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROUTES, routeKey } from '@/server/routes';
import { findOversizedFiles, MAX_LINES } from '../scripts/check-file-size.mjs';
import { checkProject } from '../scripts/check-no-ai.mjs';
import { bodyReadsIn, looseSpots } from './helpers/strict-body';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// ---------- pure helpers ----------

// The scans below list and read the same tree again and again; nothing here writes to it, so
// each listing and each file is read once per run and kept (issue 17: the scans timed out
// under a loaded full suite).
const listings = new Map<string, readonly string[]>();
const contents = new Map<string, string>();

/** All files under `dir` (relative to the repo root, forward slashes) that match `pattern`. */
function listFiles(dir: string, pattern: RegExp): string[] {
  const key = `${dir}\0${String(pattern)}`;
  let files = listings.get(key);
  if (!files) {
    files = readdirSync(path.join(repoRoot, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => pattern.test(file))
      .sort();
    listings.set(key, files);
  }
  return [...files];
}

function read(file: string): string {
  let text = contents.get(file);
  if (text === undefined) {
    text = readFileSync(path.join(repoRoot, file), 'utf8');
    contents.set(file, text);
  }
  return text;
}

/** Lines of `file`; works with LF and CRLF checkouts. */
const readLines = (file: string) => read(file).split(/\r?\n/);

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

/** A comment line (`// …`, `/* …`, ` * …`): comments may name the calls they forbid. */
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

type Finding = { file: string; line: number; problem: string };
type Check = { pattern: RegExp; problem: string };

const formatFindings = (findings: Finding[]) =>
  findings.map(({ file, line, problem }) => `${file}:${line} ${problem}`).join('\n');

/** Every non-comment line of `file` that matches a check, unless `skipLine` says otherwise. */
function scanLines(
  file: string,
  checks: readonly Check[],
  skipLine: (index: number, lines: string[]) => boolean = () => false
): Finding[] {
  const lines = readLines(file);
  return lines.flatMap((text, index) =>
    isComment(text) || skipLine(index, lines)
      ? []
      : checks
          .filter(({ pattern }) => pattern.test(text))
          .map(({ problem }) => ({ file, line: index + 1, problem }))
  );
}

/** src/domain/**\/*.ts without tests and type declarations. */
const domainModules = () =>
  listFiles('src/domain', /\.ts$/).filter((file) => !isTest(file) && !file.endsWith('.d.ts'));

// `from '…'`, `import('…')` or `import '…'` of a module that does I/O or needs a framework.
// node:crypto is the one node: module allowed: its createHash is deterministic and does no
// I/O, and the audit chain hashes rows in src/domain/audit (docs/features/audit-chain.md).
const FORBIDDEN_DOMAIN_IMPORT = new RegExp(
  String.raw`(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]` +
    String.raw`(node:(?!crypto['"])[^'"]*|fs(/[^'"]*)?|path|next(/[^'"]*)?|react(-dom)?(/[^'"]*)?` +
    String.raw`|@prisma/[^'"]*|@/server/[^'"]*|@/data/load|@/generated/[^'"]*)['"]`
);

// The only import from node:crypto the domain may have: createHash, which is deterministic.
const IMPURE_CRYPTO_IMPORT =
  /^(?!import\s*\{\s*createHash\s*\}\s*from\s*['"]node:crypto['"]).*['"]node:crypto['"]/;

const DOMAIN_IMPURITIES: readonly Check[] = [
  { pattern: IMPURE_CRYPTO_IMPORT, problem: 'takes more than createHash from node:crypto' },
  { pattern: /\bnew Date\(\s*\)/, problem: 'new Date() reads the clock' },
  { pattern: /\bDate\.now\b/, problem: 'Date.now reads the clock' },
  { pattern: /\bMath\.random\b/, problem: 'Math.random is not deterministic' },
  { pattern: /(?<![\w.])fetch\(/, problem: 'fetch( does network I/O' },
  { pattern: /(?<![\w.])process\./, problem: 'process. reads the environment' },
  { pattern: FORBIDDEN_DOMAIN_IMPORT, problem: 'imports I/O, a framework or server code' },
];

const HTTP_METHOD = '(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)';
const IMPORTS_HANDLE_ROUTE =
  /import\s*\{[^}]*\bhandleRoute\b[^}]*\}\s*from\s*['"]@\/server\/api-response['"]/;
const FUNCTION_HANDLER = new RegExp(String.raw`^export\s+(async\s+)?function\s+${HTTP_METHOD}\b`);
const CONST_HANDLER = new RegExp(String.raw`^export\s+const\s+${HTTP_METHOD}\s*=\s*(.*)$`);

/** Problems with the exported HTTP handlers of one route.ts. */
function findUnwrappedHandlers(file: string): Finding[] {
  const findings: Finding[] = [];
  if (!IMPORTS_HANDLE_ROUTE.test(read(file))) {
    findings.push({ file, line: 1, problem: 'does not import handleRoute' });
  }
  readLines(file).forEach((text, index) => {
    const line = index + 1;
    if (FUNCTION_HANDLER.test(text)) {
      findings.push({ file, line, problem: 'exports a bare function, not handleRoute(…)' });
    }
    const constant = CONST_HANDLER.exec(text);
    if (constant && !/^handleRoute\(/.test(constant[2] ?? '')) {
      findings.push({ file, line, problem: `${constant[1]} is not handleRoute(…)` });
    }
  });
  return findings;
}

// Data-pack loaders are not business changes, so they may write without an audit row.
// A function counts as a loader when its name starts with `seed` (e.g. seedAssets).
const SEED_FUNCTION = /^(export\s+)?(async\s+)?function\s+seed\w*\s*[<(]/;

/** True inside a top-level `function seed…` (Prettier closes it with `}` at column 0). */
function isInsideSeedFunction(index: number, lines: string[]): boolean {
  for (let i = index; i >= 0; i--) {
    const text = lines[i] ?? '';
    if (SEED_FUNCTION.test(text)) return true;
    if (i < index && text === '}') return false;
  }
  return false;
}

const UNAUDITED_WRITES: readonly Check[] = [
  {
    pattern: /\bdb\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
    problem: 'writes through db instead of the tx from withAudit()',
  },
  { pattern: /\$transaction\(/, problem: 'opens its own $transaction instead of withAudit()' },
];

const AUDIT_ROW_MUTATIONS: readonly Check[] = [
  {
    pattern: /\bauditLog\.(update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\(/,
    problem: 'changes or deletes an audit row; the audit log is append-only',
  },
];

// docs/features/test-isolation.md (D37): one reset, one handler set-up, no concurrency.
const RESET_HELPER = 'tests/helpers/reset-db.ts';
const HANDLER_HELPER = 'tests/helpers/with-handlers.ts';
const TABLE_CLEARING: readonly Check[] = [
  {
    pattern: /\.deleteMany\(/,
    problem: 'clears a table itself; call resetDb() from ' + RESET_HELPER,
  },
];
const HANDLER_SETUP: readonly Check[] = [
  {
    pattern: /['"](\.{1,2}\/|@\/server\/)[\w./-]*event-handlers['"]/,
    problem: 'imports event-handlers; call withProductionHandlers() from ' + HANDLER_HELPER,
  },
  { pattern: /\bclearHandlers\(/, problem: 'clears the handler registry; use ' + HANDLER_HELPER },
];
const CONCURRENT_TESTS: readonly Check[] = [
  {
    pattern: /\b(describe|it|test)\.concurrent\b/,
    problem: 'runs tests concurrently on one database and one handler registry',
  },
];

// Raw SQL skips the query builder's parameters and the row schemas (issue 17). Tests may play
// the attacker with it; scripts/tamper-audit.mjs is outside src/ on purpose (the tamper demo).
const RAW_SQL: readonly Check[] = [
  {
    pattern: /\$(queryRaw|executeRaw|runCommandRaw)/,
    problem: 'runs raw SQL; use the Prisma query builder',
  },
  { pattern: /\$\w*Unsafe\b/, problem: 'calls a Prisma …Unsafe method' },
  { pattern: /\bPrisma\.raw\(/, problem: 'builds raw SQL with Prisma.raw' },
  {
    pattern: /(\bfrom\s*|\brequire\(\s*|\bimport\(\s*)['"]better-sqlite3['"]/,
    problem: 'opens SQLite with better-sqlite3 itself, past Prisma',
  },
];

/** The code of one line, comments cut out: a comment may name a call, code after it may not. */
function codeOf(line: string): string {
  let text = line;
  if (/^\s*\*/.test(text)) text = text.includes('*/') ? text.slice(text.indexOf('*/') + 2) : '';
  return text.replace(/\/\*.*?(\*\/|$)/g, ' ').replace(/\/\/.*$/, '');
}

/** Every line of `file` whose code, without its comments, matches a check. */
const scanCode = (file: string, checks: readonly Check[]): Finding[] =>
  readLines(file).flatMap((text, index) =>
    checks
      .filter(({ pattern }) => pattern.test(codeOf(text)))
      .map(({ problem }) => ({ file, line: index + 1, problem }))
  );

/** `/api/…` of a route.ts under src/app/api. */
const routePathOf = (file: string) => file.replace(/^src\/app/, '').replace(/\/route\.ts$/, '');

/** Hand-written TypeScript under src/ and tests/: the generated Prisma client is left out. */
const sourceAndTests = () =>
  [...listFiles('src', /\.tsx?$/), ...listFiles('tests', /\.ts$/)].filter(
    (file) => !file.startsWith('src/generated/')
  );

// ---------- the rules ----------

// 30 s, not the default 5 s: these tests scan the whole tree (no-AI walks it in its own script),
// and under a loaded full suite a scan has taken 5 to 7 s although it takes under 1 s alone.
describe('meta rules', { timeout: 30_000 }, () => {
  // RULES.md §8 "Small files" and AGENTS.md; also scripts/check-file-size.mjs.
  it(`no hand-written source file is over ${MAX_LINES} lines`, () => {
    const output = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      // Rule 11: a sync call blocks vitest's own timer, so the deadline must be git's.
      { cwd: repoRoot, encoding: 'utf8', timeout: 20_000 }
    );
    const paths = [...new Set(output.split('\0').filter(Boolean))];
    const readIfExists = (file: string): string | null =>
      existsSync(path.join(repoRoot, file)) ? read(file) : null;
    const oversized: { path: string; lines: number }[] = findOversizedFiles(paths, readIfExists);
    expect(oversized, `split these files, the limit is ${MAX_LINES} lines`).toEqual([]);
  });

  // RULES.md §1 "No AI inside the product" and AGENTS.md; also scripts/check-no-ai.mjs.
  it('the app has no AI/ML package, import or API key', () => {
    const problems: string[] = checkProject(repoRoot);
    expect(problems).toEqual([]);
  });

  // RULES.md §4: "Every domain function has tests next to it".
  it('every domain module has a test next to it', () => {
    const untested = domainModules().filter(
      (file) => !existsSync(path.join(repoRoot, file.replace(/\.ts$/, '.test.ts')))
    );
    expect(untested, 'add a <name>.test.ts next to each of these').toEqual([]);
  });

  // RULES.md §4 and src/domain/README.md rules 1-2: pure and deterministic.
  it('domain code never reads the clock, randomness, the network or the environment', () => {
    const findings = domainModules().flatMap((file) => scanLines(file, DOMAIN_IMPURITIES));
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // RULES.md §6 "One API shape": wrap handlers in handleRoute().
  it('every API route handler is wrapped in handleRoute', () => {
    const routes = listFiles('src/app/api', /(^|\/)route\.ts$/);
    expect(routes.length).toBeGreaterThan(0);
    const findings = routes.flatMap(findUnwrappedHandlers);
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // D73, D74: authority and being signed in are checked before the action. Every route asks
  // authorize() first, except the public ones named here with the reason they are public.
  it('every API route not on the public allowlist calls authorize', () => {
    const PUBLIC_ROUTES: Record<string, string> = {
      'src/app/api/actor/route.ts': 'the "continue as" picker itself (D17), a demo tool (D93)',
      'src/app/api/login/route.ts': 'asking for a sign-in link: nobody to authorize yet (D93)',
      'src/app/api/login/[token]/route.ts': 'the token is the visitor’s authority (D93)',
      'src/app/api/assets/route.ts': 'the catalogue',
      'src/app/api/assets/[id]/passport/route.ts': 'the passport is public',
      'src/app/api/audit-log/route.ts': 'the audit page is public',
      'src/app/api/audit-log/verify/route.ts': 'the audit chain check is public',
      'src/app/api/demo/clock/route.ts': 'the demo clock (D71), no record of anyone',
      'src/app/api/quotes/route.ts': 'a price snapshot, owned by no customer until applied',
      'src/app/api/quotes/[id]/route.ts': 'a price snapshot',
      'src/app/api/quotes/preview/route.ts': 'the live price',
      'src/app/api/sign/[token]/route.ts': 'the token is the signatory’s authority (D46)',
    };
    const routes = listFiles('src/app/api', /(^|\/)route\.ts$/);
    const missing = routes.filter(
      (file) => !(file in PUBLIC_ROUTES) && !/\bauthorize\(/.test(read(file))
    );
    expect(missing, 'routes that never call authorize(').toEqual([]);
    const stale = Object.keys(PUBLIC_ROUTES).filter((file) => !routes.includes(file));
    expect(stale, 'allowlisted routes that no longer exist').toEqual([]);
  });

  // RULES.md §7 "Every change leaves an audit trail": writes use the tx from withAudit().
  it('every write to the database goes through withAudit', () => {
    const candidates = [...listFiles('src/server', /\.ts$/), ...listFiles('src/app', /\.tsx?$/)];
    const files = candidates.filter((file) => !isTest(file) && file !== 'src/server/audit.ts');
    const findings = files.flatMap((file) =>
      scanLines(file, UNAUDITED_WRITES, isInsideSeedFunction)
    );
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // RULES.md §7 and docs/features/audit-chain.md: the audit log is append-only; the hash chain
  // would show an edit, and the app never makes one. Tests may clear their own database.
  it('no app code updates or deletes audit rows', () => {
    const files = listFiles('src', /\.tsx?$/).filter(
      (file) => !isTest(file) && !file.startsWith('src/generated/')
    );
    const findings = files.flatMap((file) => scanLines(file, AUDIT_ROW_MUTATIONS));
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // docs/features/test-isolation.md (D37) rule 1: every test database is emptied one way.
  it('no file clears a table except the resetDb helper', () => {
    const files = sourceAndTests().filter(
      (file) => file !== RESET_HELPER && file !== 'tests/meta-rules.test.ts'
    );
    const findings = files.flatMap((file) => scanLines(file, TABLE_CLEARING));
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // D37 rule 2: a test's handlers come from the helper, never from what its file imported.
  it('no test imports event-handlers or clears the registry except through the helper', () => {
    const files = sourceAndTests().filter(
      (file) =>
        (isTest(file) || file.startsWith('tests/')) &&
        file !== HANDLER_HELPER &&
        file !== 'src/server/events.test.ts' &&
        file !== 'tests/meta-rules.test.ts'
    );
    const findings = files.flatMap((file) => scanLines(file, HANDLER_SETUP));
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // D37 rule 3: tests that share a database file or the registry run one after another.
  it('no server or scenario test runs concurrently', () => {
    const files = [
      ...listFiles('src/server', /\.test\.ts$/),
      ...listFiles('src/domain/scenarios', /\.test\.ts$/),
      ...listFiles('src/app', /\.test\.ts$/),
      ...listFiles('tests/helpers', /\.ts$/),
    ];
    const findings = files.flatMap((file) => scanLines(file, CONCURRENT_TESTS));
    expect(findings, formatFindings(findings)).toEqual([]);
  });

  // RULES.md §9 "Four languages". Same keys in all four: src/i18n/messages.test.ts.
  it('the UI has message files for exactly en, fi, sv and et', () => {
    const files = readdirSync(path.join(repoRoot, 'src/i18n/messages')).sort();
    expect(files).toEqual(['en.json', 'et.json', 'fi.json', 'sv.json']);
  });

  // Issue 17: a request body refuses keys it does not name (mass assignment), nested objects
  // too. The bodies come from the route table, so a new route is covered without editing this.
  it('every request body in the route table refuses unknown keys, nested objects too', () => {
    const withBody = ROUTES.filter((route) => route.body);
    expect(withBody.length).toBeGreaterThan(0);
    const findings = withBody.flatMap((route) =>
      looseSpots(route.body).map((spot) => `${routeKey(route)}: ${spot}`)
    );
    expect(findings, findings.join('\n')).toEqual([]);
  });

  // The table's bodies are the app's bodies only if every route.ts parses each body it reads
  // with the very schema of its row: each read is followed through the file's own import to
  // that module's export, a read it cannot follow fails, and a row whose body no route parses
  // fails too (review of PR 23, findings 1 and 2).
  it('every route that reads a body parses it with the body schema of its route-table row', async () => {
    const routeFiles = listFiles('src/app/api', /(^|\/)route\.ts$/);
    expect(routeFiles.length).toBeGreaterThan(0);
    const findings: string[] = [];
    const parsedBy = new Map<string, unknown[]>();
    for (const file of routeFiles) {
      const { uses, problems } = bodyReadsIn(read(file));
      findings.push(...problems.map((problem) => `${file} ${problem}`));
      const rowBodies: unknown[] = ROUTES.filter(
        (route) => route.path === routePathOf(file) && route.body
      ).map((route) => route.body);
      const parsed: unknown[] = [];
      for (const { local, imported, module } of uses) {
        const exports = (await import(`../src/server/${module}.ts`)) as Record<string, unknown>;
        parsed.push(exports[imported]);
        if (!rowBodies.includes(exports[imported])) {
          findings.push(`${file} parses its body with ${local}, not its row's body in routes.ts`);
        }
      }
      parsedBy.set(file, parsed);
    }
    for (const route of ROUTES.filter((row) => row.body)) {
      const file = `src/app${route.path}/route.ts`;
      if (!parsedBy.get(file)?.includes(route.body)) {
        findings.push(`${routeKey(route)} has a body in routes.ts that ${file} never parses`);
      }
    }
    expect(findings, findings.join('\n')).toEqual([]);
  });

  // Issue 17: app code reaches the database through the query builder only. Comments may name
  // the calls; tests may use them to play the attacker.
  it('no app code runs raw SQL or a Prisma …Unsafe method', () => {
    const files = listFiles('src', /\.[cm]?[jt]sx?$/).filter(
      (file) => !isTest(file) && !file.startsWith('src/generated/')
    );
    expect(files.length).toBeGreaterThan(0);
    const findings = files.flatMap((file) => scanCode(file, RAW_SQL));
    expect(findings, formatFindings(findings)).toEqual([]);
  });
});
