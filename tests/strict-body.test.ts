// The strict-body meta tests in tests/meta-rules.test.ts are only as good as their helpers in
// tests/helpers/strict-body.ts. Each case pins one way to be loose or to read a body past the
// table; the first also checks that Zod itself lets an extra key through a z.object(). The
// cases from the review of PR 23 (findings 1 to 4, 6 and 7) are each a hole it planted.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codeLines } from './helpers/code-text';
import { bodyReadsIn, looseSpots, rawBodyReadLines } from './helpers/strict-body';

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

  // Review finding 3: an open value inside a strict body is mass assignment too.
  it('flags any, unknown, custom and a bare transform as accepting any value', () => {
    expect(
      z.strictObject({ meta: z.unknown() }).safeParse({ meta: { role: 'admin' } }).success
    ).toBe(true);
    expect(looseSpots(z.strictObject({ meta: z.unknown().optional() }))).toEqual([
      'body.meta accepts any value (z.unknown)',
    ]);
    expect(looseSpots(z.any())).toEqual(['body accepts any value (z.any)']);
    expect(looseSpots(z.union([z.strictObject({ name }), z.any()]))).toEqual([
      'body accepts any value (z.any)',
    ]);
    expect(looseSpots(z.custom(() => true))).toEqual(['body accepts any value (z.custom)']);
    expect(looseSpots(z.instanceof(Date))).toEqual(['body accepts any value (z.custom)']);
    expect(looseSpots(z.transform((value) => value))).toEqual([
      'body accepts any value (z.transform)',
    ]);
  });

  // Review finding 4: a loose record, and keys that are any string behind a union or a pipe.
  it('flags z.looseRecord and any-string keys behind a union or a pipe', () => {
    const looseRecord = z.looseRecord(z.string().regex(/^t_/), z.string());
    expect(looseRecord.safeParse({ t_a: 'x', evil: { deep: 1 } }).success).toBe(true);
    expect(looseSpots(looseRecord)).toEqual([
      'body is a loose record: keys its key schema refuses pass',
    ]);
    const any = 'body is a record whose keys are any string';
    expect(looseSpots(z.record(z.union([z.string(), z.literal('x')]), name))).toEqual([any]);
    expect(looseSpots(z.record(z.string().pipe(z.string()), name))).toEqual([any]);
    expect(looseSpots(z.record(z.union([z.literal('a'), z.literal('b')]), name))).toEqual([]);
  });

  // Review finding 6: .catch() answers a refused body with its fallback instead of refusing it.
  it('flags .catch() even on a strict object', () => {
    const caught = z.strictObject({ name }).catch({ name: 'fallback' });
    expect(caught.safeParse({ name: 'a', extra: 1 }).success).toBe(true);
    expect(looseSpots(caught)).toEqual(['body turns a refused value into its fallback (.catch)']);
  });

  // Review finding 7: a recursive schema is walked once around its loop, not to a stack overflow.
  it('walks a recursive schema once and still names a loose object in it', () => {
    const strictNode: z.ZodType = z.lazy(() => z.strictObject({ next: strictNode.optional() }));
    const looseNode: z.ZodType = z.lazy(() => z.object({ next: looseNode.optional() }));
    expect(looseSpots(z.strictObject({ tree: strictNode }))).toEqual([]);
    expect(looseSpots(z.strictObject({ tree: looseNode }))).toEqual([
      'body.tree accepts unknown keys',
    ]);
    expect(looseSpots(z.json())).toContain('body is a record whose keys are any string');
  });
});

describe('bodyReadsIn, the body-read tracer', () => {
  const imports = "import { readJsonBody } from '@/server/api-response';\n";

  it('follows readJsonBody and schema.parse(body) to the module each schema was imported from', () => {
    const source =
      imports +
      "import { actorBodySchema as body } from '@/server/routes';\n" +
      "import { assessmentBodySchema } from '@/server/second-life-schemas';\n" +
      'const a = await readJsonBody(request, body);\n' +
      'const text = await readBodyText(request);\n' +
      'return assessmentBodySchema.parse(body);\n';
    expect(bodyReadsIn(source)).toEqual({
      uses: [
        { local: 'body', imported: 'actorBodySchema', module: 'routes' },
        {
          local: 'assessmentBodySchema',
          imported: 'assessmentBodySchema',
          module: 'second-life-schemas',
        },
      ],
      problems: [],
    });
  });

  // Review finding 1: a local schema with the strict schema's name.
  it('refuses a schema declared in the route or imported from elsewhere', () => {
    const local =
      imports +
      'const signByTokenBodySchema = z.object({ action: z.string() }).passthrough();\n' +
      'await readJsonBody(request, signByTokenBodySchema);\n';
    expect(bodyReadsIn(local).problems).toEqual([
      "declares its own signByTokenBodySchema instead of importing the table's",
    ]);
    const elsewhere =
      "import { bodySchema } from './schemas';\nawait readJsonBody(request, bodySchema);";
    expect(bodyReadsIn(elsewhere).problems).toEqual([
      'parses its body with bodySchema, not imported from routes.ts or a *-schemas.ts',
    ]);
  });

  // Review finding 2: a read it cannot see, or one call among several it cannot trace.
  it('refuses request.json() and the like, and every readJsonBody call it cannot trace', () => {
    expect(bodyReadsIn('const b = (await request.json()) as { actor: string };').problems).toEqual([
      'reads the request body itself (request.json() or the like); use readJsonBody',
    ]);
    expect(bodyReadsIn('const f = await req.formData();').problems).toHaveLength(1);
    const twice =
      "import { demoClockBodySchema } from '@/server/routes';\n" +
      'await readJsonBody(request, demoClockBodySchema);\n' +
      'await readJsonBody(request, z.object({ asOf: z.string() }).loose());\n';
    expect(bodyReadsIn(twice).problems).toEqual([
      'calls readJsonBody 2 times, 1 with a schema name this test can trace',
    ]);
    expect(bodyReadsIn('const text = await readBodyText(request);').problems).toEqual([
      'reads the body text 1 times and parses it with a named schema 0 times',
    ]);
  });

  // Re-review findings 2 to 4: disguised raw reads, a renamed reader, and comments.
  it('sees a raw read through a cast, a clone or a line break, and a renamed reader', () => {
    expect(rawBodyReadLines('await (request as Request).json();')).toEqual([1]);
    expect(rawBodyReadLines('await request.clone().json();')).toEqual([1]);
    expect(rawBodyReadLines('await request\n  .json();')).toEqual([2]);
    expect(rawBodyReadLines('const b = request.body;')).toEqual([1]);
    expect(rawBodyReadLines('f({ ...body }); jsonSchema(route.body);')).toEqual([]);
    const renamed =
      "import { readJsonBody as rj } from '@/server/api-response';\n" +
      'ok(await rj(request, z.looseObject({})));';
    expect(bodyReadsIn(renamed).problems).toEqual([
      'imports readJsonBody or readBodyText under another name this test cannot follow',
    ]);
  });

  it('reads code, not comments', () => {
    expect(
      bodyReadsIn('// Never call request.json() here: readJsonBody does it.').problems
    ).toEqual([]);
    expect(rawBodyReadLines('/* request.json() */ const x = 1;')).toEqual([]);
  });
});

// Re-review finding 1: a comment start inside a string is part of the string.
describe('codeLines, the comment cut', () => {
  it('cuts comments and keeps strings, even with // or /* inside them', () => {
    expect(codeLines("const base = 'http://localhost'; db.$queryRawUnsafe('SELECT 1');")).toEqual([
      "const base = 'http://localhost'; db.$queryRawUnsafe('SELECT 1');",
    ]);
    expect(codeLines("const accept = 'text/*'; db.$executeRawUnsafe('x');")).toEqual([
      "const accept = 'text/*'; db.$executeRawUnsafe('x');",
    ]);
    expect(codeLines("  /* c */ return db['$queryRaw'];")).toEqual(["    return db['$queryRaw'];"]);
    expect(codeLines('x(); // db.$queryRaw')).toEqual(['x(); ']);
    expect(codeLines("/* it's */ y();")).toEqual(['  y();']);
    expect(codeLines('/**\n * db.$queryRaw\n */ z();')).toEqual(['', '', '  z();']);
    expect(codeLines('const t = `a\n// b`; w();')).toEqual(['const t = `a', '// b`; w();']);
  });
});
