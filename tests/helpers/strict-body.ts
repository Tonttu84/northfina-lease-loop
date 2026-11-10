// The strict-body meta tests' helpers (issue 17, review of PR 23), split out of
// tests/meta-rules.test.ts to keep it under 600 lines. Pure: a schema or a file's text in,
// findings out. Their own tests: tests/strict-body.test.ts.
import { codeLines } from './code-text';

// Zod 4 (package.json: zod ^4.6.7) says in a schema's definition whether an object refuses
// unknown keys: z.strictObject() and .strict() set `catchall` to z.never(); z.object() leaves it
// unset (unknown keys are dropped silently) and z.looseObject() or .passthrough() set it to
// z.unknown() (node_modules/zod/v4/classic/schemas.js). A record is a dictionary: its key schema
// decides which keys pass, so one whose keys may be any string (no pattern or format, only
// lengths) is as loose as a loose object, and a z.looseRecord passes keys its key schema refuses.
type AnyDef = { type: string } & Record<string, unknown>;
const defOf = (schema: unknown) => (schema as { _zod: { def: AnyDef } })._zod.def;

// Wrappers whose one child is `innerType`; types that hold no object at all. `catch` is not a
// wrapper here: it turns a refused body into its fallback instead of refusing it.
const WRAPPERS = new Set([
  'optional',
  'nullable',
  'nonoptional',
  'default',
  'prefault',
  'readonly',
]);
const LEAVES = new Set(
  'string number bigint boolean date symbol null undefined void never nan literal enum template_literal file'.split(
    ' '
  )
);
// Types that accept any value at all: an open door inside a strict body.
const OPEN = new Set(['any', 'unknown', 'custom', 'transform']);

/** True when a record with this key schema takes any string as a key. */
function anyStringKey(schema: unknown): boolean {
  const def = defOf(schema);
  if (def.type === 'string') {
    const checks = (def.checks ?? []) as unknown[];
    return !def.format && !checks.some((check) => defOf(check).check === 'string_format');
  }
  if (def.type === 'union') return (def.options as unknown[]).some(anyStringKey);
  if (def.type === 'pipe') return anyStringKey(def.in);
  if (WRAPPERS.has(def.type)) return anyStringKey(def.innerType);
  return false;
}

/**
 * Where inside `schema` a key or a value the schema does not name would get through; `[]` when
 * nowhere. `walking` holds the definitions on the current path, so a recursive schema (a
 * self-referencing z.lazy) is walked once around its loop instead of overflowing the stack.
 */
export function looseSpots(schema: unknown, at = 'body', walking = new Set<AnyDef>()): string[] {
  const def = defOf(schema);
  if (walking.has(def)) return [];
  walking.add(def);
  try {
    return spotsOf(def, at, (child, where) => looseSpots(child, where, walking));
  } finally {
    walking.delete(def);
  }
}

function spotsOf(def: AnyDef, at: string, walk: (child: unknown, at: string) => string[]) {
  switch (def.type) {
    case 'object': {
      const strict = def.catchall !== undefined && defOf(def.catchall).type === 'never';
      const shape = Object.entries(def.shape as Record<string, unknown>);
      return [
        ...(strict ? [] : [`${at} accepts unknown keys`]),
        ...shape.flatMap(([key, child]) => walk(child, `${at}.${key}`)),
      ];
    }
    case 'record':
      return [
        ...(def.mode === 'loose'
          ? [`${at} is a loose record: keys its key schema refuses pass`]
          : []),
        ...(anyStringKey(def.keyType) ? [`${at} is a record whose keys are any string`] : []),
        ...walk(def.valueType, `${at}[key]`),
      ];
    case 'array':
      return walk(def.element, `${at}[]`);
    case 'union':
      return (def.options as unknown[]).flatMap((option) => walk(option, at));
    case 'intersection':
      return [...walk(def.left, at), ...walk(def.right, at)];
    case 'pipe':
      // `.transform(fn)` is a pipe into a transform: the input schema is what refuses keys.
      return defOf(def.out).type === 'transform'
        ? walk(def.in, at)
        : [...walk(def.in, at), ...walk(def.out, at)];
    case 'lazy':
      return walk((def.getter as () => unknown)(), at);
    case 'catch':
      return [`${at} turns a refused value into its fallback (.catch)`, ...walk(def.innerType, at)];
    default:
      if (WRAPPERS.has(def.type)) return walk(def.innerType, at);
      if (OPEN.has(def.type)) return [`${at} accepts any value (z.${def.type})`];
      if (LEAVES.has(def.type)) return [];
      return [`${at} is a Zod ${def.type}, which this test cannot see into; teach looseSpots`];
  }
}

/** A schema a route parses its body with, and where the route imported it from. */
export type BodySchemaUse = { local: string; imported: string; module: string };

// The ways a route.ts may read a body: readJsonBody(request, schema), or readBodyText(request)
// and then schema.parse(body) (the assessment route, whose body is optional).
const READ_JSON_CALL = /\breadJsonBody\(/g;
const READ_JSON_TRACED = /\breadJsonBody\(\s*\w+\s*,\s*(\w+)\s*\)/g;
const READ_TEXT_CALL = /\breadBodyText\(/g;
const PARSE_BODY = /\b(\w+)\.(?:safe)?[pP]arse\(\s*body\s*\)/g;
const RENAMED_READER = /\b(readJsonBody|readBodyText)\s+as\b/;
const SCHEMA_IMPORT =
  /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@\/server\/(routes|[\w-]+-schemas)['"]/g;

// A body read past readJsonBody: `.json()` and its kin on anything (a cast, a clone, a line
// break before the dot), or `.body`, except a spread (`...body`) and the route table's own
// `route.body` (src/server/openapi.ts). Only readBodyText in src/server/api-response.ts may.
const RAW_BODY_READ = /\.\s*(json|text|formData|arrayBuffer|blob)\(\s*\)|(?<!\.\.|\broute)\.body\b/;

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

/** The 1-based numbers of the lines of `source` whose code reads a request body itself. */
export const rawBodyReadLines = (source: string): number[] =>
  codeLines(source).flatMap((code, index) => (RAW_BODY_READ.test(code) ? [index + 1] : []));

/** The body reads of one route.ts: each schema it parses a body with, or why it cannot tell. */
export function bodyReadsIn(text: string): { uses: BodySchemaUse[]; problems: string[] } {
  const problems: string[] = [];
  const source = codeLines(text).join('\n');
  if (rawBodyReadLines(text).length > 0) {
    problems.push('reads the request body itself (request.json() or the like); use readJsonBody');
  }
  if (RENAMED_READER.test(source)) {
    problems.push(
      'imports readJsonBody or readBodyText under another name this test cannot follow'
    );
  }
  const traced = [...source.matchAll(READ_JSON_TRACED)].map((match) => match[1] ?? '');
  const calls = count(source, READ_JSON_CALL);
  if (calls > traced.length) {
    problems.push(
      `calls readJsonBody ${calls} times, ${traced.length} with a schema name this test can trace`
    );
  }
  const parsed = [...source.matchAll(PARSE_BODY)].map((match) => match[1] ?? '');
  const textReads = count(source, READ_TEXT_CALL);
  if (textReads > parsed.length) {
    problems.push(
      `reads the body text ${textReads} times and parses it with a named schema ${parsed.length} times`
    );
  }
  const imports = new Map<string, Omit<BodySchemaUse, 'local'>>();
  for (const [, names = '', module = ''] of source.matchAll(SCHEMA_IMPORT)) {
    for (const spec of names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)) {
      const [imported = '', local = imported] = spec.split(/\s+as\s+/);
      imports.set(local, { imported, module });
    }
  }
  const uses: BodySchemaUse[] = [];
  for (const local of [...traced, ...parsed]) {
    const from = imports.get(local);
    if (new RegExp(String.raw`\b(const|let|var|function|class)\s+${local}\b`).test(source)) {
      problems.push(`declares its own ${local} instead of importing the table's`);
    } else if (!from) {
      problems.push(`parses its body with ${local}, not imported from routes.ts or a *-schemas.ts`);
    } else {
      uses.push({ local, ...from });
    }
  }
  return { uses, problems };
}
