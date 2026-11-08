// The seven id routes this fix bounded parse their params with their schema before anything is
// read (the pattern of GET /api/applications/[id], wave 3 finding 10; the other id routes already
// did): an id over 100 characters is a 400 VALIDATION_ERROR, and one at the bound reaches the
// route's normal answer (401 for a private route asked anonymously, 404 for a public one that
// finds nothing). Only `db` and `next/headers` cookies are replaced.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../../tests/helpers/test-db';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const contract = await import('./contracts/[id]/route');
const exitPreview = await import('./contracts/[id]/exit-preview/route');
const exit = await import('./contracts/[id]/exit/route');
const pay = await import('./invoices/[id]/pay/route');
const quote = await import('./quotes/[id]/route');
const passport = await import('./assets/[id]/passport/route');
const assessments = await import('./assets/[id]/assessments/route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

const ROUTES: { name: string; handler: Handler; method: 'GET' | 'POST'; atBound: number }[] = [
  {
    name: 'GET /api/contracts/[id]',
    handler: contract.GET as Handler,
    method: 'GET',
    atBound: 401,
  },
  {
    name: 'GET /api/contracts/[id]/exit-preview',
    handler: exitPreview.GET as Handler,
    method: 'GET',
    atBound: 401,
  },
  {
    name: 'POST /api/contracts/[id]/exit',
    handler: exit.POST as Handler,
    method: 'POST',
    atBound: 401,
  },
  {
    name: 'POST /api/invoices/[id]/pay',
    handler: pay.POST as Handler,
    method: 'POST',
    atBound: 401,
  },
  { name: 'GET /api/quotes/[id]', handler: quote.GET as Handler, method: 'GET', atBound: 404 },
  {
    name: 'GET /api/assets/[id]/passport',
    handler: passport.GET as Handler,
    method: 'GET',
    atBound: 404,
  },
  {
    name: 'POST /api/assets/[id]/assessments',
    handler: assessments.POST as Handler,
    method: 'POST',
    atBound: 401,
  },
];

const call = (route: (typeof ROUTES)[number], id: string) =>
  route.handler(new Request('http://test/api', { method: route.method }), {
    params: Promise.resolve({ id }),
  });

describe.each(ROUTES)('$name', (route) => {
  it('an id over 100 characters is 400 VALIDATION_ERROR', async () => {
    const response = await call(route, 'x'.repeat(101));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error: { code: string } };
    expect(body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it(`an id of 100 characters passes the bound and gets ${route.atBound}`, async () => {
    const response = await call(route, 'x'.repeat(100));
    expect(response.status).toBe(route.atBound);
  });
});

describe('the 404 messages name no id', () => {
  it('GET /api/quotes/[id] and GET /api/assets/[id]/passport answer a constant message', async () => {
    for (const route of ROUTES.filter((candidate) => candidate.atBound === 404)) {
      const body = (await (await call(route, 'no-such-id')).json()) as {
        error: { message: string };
      };
      expect(body.error.message).not.toContain('no-such-id');
    }
  });
});
