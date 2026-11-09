// POST and DELETE /api/actor, the "continue as" picker (D17), against a real, migrated SQLite
// database: a known id is checked against the customers and comes back as a signed session
// cookie (D92); an unknown id is 404; DELETE clears the cookie.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCustomers } from '@/data/load';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { ACTOR_COOKIE } from '@/server/actor';
import { seedCustomers } from '@/server/customers';
import type { PrismaClient } from '@/server/prisma-client';
import { sessionSecret, verifySession } from '@/server/session';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { POST, DELETE } = await import('./route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
  await seedCustomers(holder.db, await loadCustomers());
});
afterAll(async () => {
  await cleanup();
});

async function post(body: unknown) {
  const request = new Request('http://localhost/api/actor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request, undefined as never);
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

/** The actor the Set-Cookie header's signed session names, verified like `readActor` would. */
function actorOf(setCookie: string): string | undefined {
  const value = decodeURIComponent(setCookie.split(';')[0]!.slice(ACTOR_COOKIE.length + 1));
  return verifySession(value, sessionSecret(), Math.floor(Date.now() / 1000))?.actor;
}

describe('POST /api/actor', () => {
  it('sets a signed session cookie that names the posted customer', async () => {
    const { status, cookies, body } = await post({ actor: 'cust-aino' });
    expect(status).toBe(200);
    expect(body.data).toEqual({ actor: 'cust-aino' });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      new RegExp(
        `^${ACTOR_COOKIE}=[A-Za-z0-9_.%-]+; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax$`
      )
    );
    expect(cookies[0]).not.toContain('=cust-aino;');
    expect(actorOf(cookies[0]!)).toBe('cust-aino');
  });

  it('does the same for admin', async () => {
    const { status, cookies } = await post({ actor: 'admin' });
    expect(status).toBe(200);
    expect(actorOf(cookies[0]!)).toBe('admin');
  });

  it('answers 404 UNKNOWN_ACTOR and sets no cookie for an id no customer has', async () => {
    const { status, cookies, body } = await post({ actor: 'cust-nobody' });
    expect(status).toBe(404);
    expect(body.error.code).toBe('UNKNOWN_ACTOR');
    expect(cookies).toEqual([]);
  });

  it('refuses anonymous as a choice and a body without an actor', async () => {
    expect((await post({ actor: 'anonymous' })).status).toBe(404);
    expect((await post({})).status).toBe(400);
  });
});

describe('DELETE /api/actor', () => {
  it('clears the cookie and answers anonymous', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/actor', { method: 'DELETE' }),
      undefined as never
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ actor: 'anonymous' });
    expect(response.headers.getSetCookie()).toEqual([
      `${ACTOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    ]);
  });
});
