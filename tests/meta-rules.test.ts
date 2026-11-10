// Meta rules: checks the repository itself against RULES.md and AGENTS.md, so `npm test`
// (pre-push hook and CI) fails as soon as someone breaks one. ESLint and the scripts in
// scripts/ enforce some of these too; this file is the belt to their braces.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ROUTES, routeKey } from '@/server/routes';
import { findOversizedFiles, MAX_LINES } from '../scripts/check-file-size.mjs';
import { checkProject } from '../scripts/check-no-ai.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// ---------- pure helpers ----------

/** All files under `dir` (relative to the repo root, forward slashes) that match `pattern`. */
function listFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(path.join(repoRoot, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => pattern.test(file))
    .sort();
}

const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

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
];

// Zod 4 (package.json: zod ^4.6.7) says in a schema's definition whether an object refuses
// unknown keys: z.strictObject() and .strict() set `catchall` to z.never(); z.object() leaves it
// unset (unknown keys are dropped silently) and z.looseObject() or .passthrough() set it to
// z.unknown() (node_modules/zod/v4/classic/schemas.js). A record is a dictionary: its key schema
// decides which keys pass, so one whose keys are any string (no pattern or format, only lengths)
// is as loose as a loose object.
type AnyDef = { type: string } & Record<string, unknown>;
const defOf = (schema: unknown) => (schema as { _zod: { def: AnyDef } })._zod.def;

// Wrappers whose one child is `innerType`; types that hold no object at all.
const WRAPPERS = new Set([
  'optional',
  'nullable',
  'nonoptional',
  'default',
  'prefault',
  'catch',
  'readonly',
]);
const LEAVES = new Set(
  'string number bigint boolean date symbol null undefined void never any unknown nan literal enum template_literal file transform custom'.split(
    ' '
  )
);

/** Where inside `schema` a key the schema does not name would get through; `[]` when nowhere. */
function looseSpots(schema: unknown, at = 'body'): string[] {
  const def = defOf(schema);
  const walk = (child: unknown, where: string) => looseSpots(child, where);
  switch (def.type) {
    case 'object': {
      const strict = def.catchall !== undefined && defOf(def.catchall).type === 'never';
      const shape = Object.entries(def.shape as Record<string, unknown>);
      return [
        ...(strict ? [] : [`${at} accepts unknown keys`]),
        ...shape.flatMap(([key, child]) => walk(child, `${at}.${key}`)),
      ];
    }
    case 'record': {
      const key = defOf(def.keyType);
      const checks = (key.checks ?? []) as unknown[];
      const patterned = key.format || checks.some((c) => defOf(c).check === 'string_format');
      const anyKey = key.type === 'string' && !patterned;
      return [
        ...(anyKey ? [`${at} is a record whose keys are any string`] : []),
        ...walk(def.valueType, `${at}[key]`),
      ];
    }
    case 'array':
      return walk(def.element, `${at}[]`);
    case 'union':
      return (def.options as unknown[]).flatMap((option) => walk(option, at));
    case 'intersection':
      return [...walk(def.left, at), ...walk(def.right, at)];
    case 'pipe':
      return [...walk(def.in, at), ...walk(def.out, at)];
    case 'lazy':
      return walk((def.getter as () => unknown)(), at);
    default:
      if (WRAPPERS.has(def.type)) return walk(def.innerType, at);
      if (LEAVES.has(def.type)) return [];
      return [`${at} is a Zod ${def.type}, which this test cannot see into; teach looseSpots`];
  }
}

/** `/api/…` of a route.ts under src/app/api. */
const routePathOf = (file: string) => file.replace(/^src\/app/, '').replace(/\/route\.ts$/, '');

// A route reads a body through readJsonBody(request, schema), or reads the text itself and
// parses it (the assessment route: `schema.parse(body)`). Either schema must be the table's.
const BODY_READER = /\b(readJsonBody|readBodyText)\(/;
const BODY_SCHEMA_USE =
  /readJsonBody\(\s*\w+\s*,\s*(\w+)\s*\)|\b(\w+)\.(?:safe)?[pP]arse\(\s*body\s*\)/g;

/** Hand-written TypeScript under src/ and tests/: the generated Prisma client is left out. */
const sourceAndTests = () =>
  [...listFiles('src', /\.tsx?$/), ...listFiles('tests', /\.ts$/)].filter(
    (file) => !file.startsWith('src/generated/')
  );

// ---------- the rules ----------

describe('meta rules', () => {
  // RULES.md §8 "Small files" and AGENTS.md; also scripts/check-file-size.mjs.
  it(`no hand-written source file is over ${MAX_LINES} lines`, () => {
    const output = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: repoRoot, encoding: 'utf8' }
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

  // The table's bodies are the app's bodies only if every route.ts that reads a body parses it
  // with the very schema of its row, so this follows each body read back to the table.
  it('every route that reads a body parses it with the body schema of its route-table row', async () => {
    // routes.ts and every src/server/*-schemas.ts: the modules a route's body schema comes from.
    const schemaModules = [
      'routes',
      ...listFiles('src/server', /-schemas\.ts$/).map((f) => path.basename(f, '.ts')),
    ];
    const modules = await Promise.all(
      schemaModules.map(
        (name) => import(`../src/server/${name}.ts`) as Promise<Record<string, unknown>>
      )
    );
    const exported = new Map(modules.flatMap((module) => Object.entries(module)));
    const readers = listFiles('src/app/api', /(^|\/)route\.ts$/).filter((file) =>
      BODY_READER.test(read(file))
    );
    expect(readers.length).toBeGreaterThan(0);
    const findings = readers.flatMap((file) => {
      const rowBodies: unknown[] = ROUTES.filter(
        (route) => route.path === routePathOf(file) && route.body
      ).map((route) => route.body);
      const used = [...read(file).matchAll(BODY_SCHEMA_USE)].map((match) => match[1] ?? match[2]);
      if (used.length === 0) return [`${file} reads a body this test cannot trace to a schema`];
      return used
        .filter((name) => !rowBodies.includes(exported.get(name ?? '')))
        .map((name) => `${file} parses its body with ${name}, not its row's body in routes.ts`);
    });
    expect(findings, findings.join('\n')).toEqual([]);
  });

  // Issue 17: app code reaches the database through the query builder only. Comments may name
  // the calls; tests may use them to play the attacker.
  it('no app code runs raw SQL or a Prisma …Unsafe method', () => {
    const files = listFiles('src', /\.[cm]?[jt]sx?$/).filter(
      (file) => !isTest(file) && !file.startsWith('src/generated/')
    );
    expect(files.length).toBeGreaterThan(0);
    const findings = files.flatMap((file) => scanLines(file, RAW_SQL));
    expect(findings, formatFindings(findings)).toEqual([]);
  });
});

// The strict-body test is only as good as looseSpots: each case pins one way to be loose, and
// the first checks Zod itself agrees that a z.object() lets an extra key through.
describe('looseSpots, the strict-body walker', () => {
  const name = z.string();

  it('passes a strict object and flags z.object(), z.looseObject() and .passthrough()', () => {
    expect(z.strictObject({ name }).safeParse({ name: 'a', extra: 1 }).success).toBe(false);
    expect(z.object({ name }).safeParse({ name: 'a', extra: 1 }).success).toBe(true);
    expect(looseSpots(z.strictObject({ name }))).toEqual([]);
    expect(looseSpots(z.object({ name }).strict())).toEqual([]);
    expect(looseSpots(z.object({ name }))).toEqual(['body accepts unknown keys']);
    expect(looseSpots(z.looseObject({ name }))).toEqual(['body accepts unknown keys']);
    expect(looseSpots(z.strictObject({ name }).passthrough())).toEqual([
      'body accepts unknown keys',
    ]);
    expect(looseSpots(z.strictObject({ name }).catchall(name))).toEqual([
      'body accepts unknown keys',
    ]);
  });

  it('finds a loose object nested under wrappers, arrays, unions, pipes and lazies', () => {
    const loose = z.object({ name });
    const body = z.strictObject({
      a: loose.optional().nullable().default(null),
      b: z.array(z.union([name, loose])),
      c: z.strictObject({ d: loose.readonly() }),
      e: loose.transform((value) => value.name),
      f: z.lazy(() => loose),
      g: z.intersection(loose, z.strictObject({})),
    });
    expect(looseSpots(body)).toEqual([
      'body.a accepts unknown keys',
      'body.b[] accepts unknown keys',
      'body.c.d accepts unknown keys',
      'body.e accepts unknown keys',
      'body.f accepts unknown keys',
      'body.g accepts unknown keys',
    ]);
    expect(looseSpots(z.strictObject({ a: z.array(z.strictObject({ name })) }))).toEqual([]);
  });

  it('flags a record whose keys are any string, not one whose keys have a pattern or a list', () => {
    expect(looseSpots(z.record(z.string(), name))).toEqual([
      'body is a record whose keys are any string',
    ]);
    expect(looseSpots(z.record(z.string().min(1).max(64), name))).toEqual([
      'body is a record whose keys are any string',
    ]);
    expect(looseSpots(z.record(z.string().regex(/^q_\w+$/), name))).toEqual([]);
    expect(looseSpots(z.record(z.enum(['a', 'b']), z.object({ name })))).toEqual([
      'body[key] accepts unknown keys',
    ]);
  });

  it('flags a Zod type it does not know rather than passing it', () => {
    expect(looseSpots(z.map(name, name))).toEqual([
      'body is a Zod map, which this test cannot see into; teach looseSpots',
    ]);
  });
});
