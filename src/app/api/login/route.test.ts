// POST /api/login and the link routes (D93, D94) against a real, migrated SQLite database:
// asking for a link answers the same for a known e-mail and for a new one, which signs up
// (D107; the link itself only while the demo tools are on), the link's state, and opening it
// sets the signed cookie.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCustomers } from '@/data/load';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { seedAccounts } from '@/server/accounts';
import { ACTOR_COOKIE, resolveActor } from '@/server/actor';
import { seedCustomers } from '@/server/customers';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import type { PrismaClient } from '@/server/prisma-client';
import { sessionSecret, verifySession } from '@/server/session';

const TODAY = '2026-11-05';
const AINO = 'aino.virtanen@example.com';

const holder = vi.hoisted(() => ({
  db: undefined as unknown as PrismaClient,
  cookies: new Map<string, string>(),
}));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { POST: requestLink } = await import('./route');
const { GET: readLink, POST: openLink } = await import('./[token]/route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(holder.db);
  const customers = await loadCustomers();
  await seedCustomers(holder.db, customers);
  await seedAccounts(holder.db, customers);
  holder.cookies = new Map([[DEMO_CLOCK_COOKIE, TODAY]]);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function ask(body: unknown) {
  const response = await requestLink(
    new Request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    undefined as never
  );
  return { status: response.status, body: await response.json() };
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

async function read(token: string) {
  const response = await readLink(new Request(`http://localhost/api/login/${token}`), ctx(token));
  return { status: response.status, body: await response.json() };
}

async function open(token: string) {
  const response = await openLink(
    new Request(`http://localhost/api/login/${token}`, { method: 'POST' }),
    ctx(token)
  );
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

describe('POST /api/login', () => {
  it('answers 202 with the link for a known e-mail while the demo tools are on', async () => {
    const { status, body } = await ask({ email: AINO });
    expect(status).toBe(202);
    expect(body.data).toEqual({
      sent: true,
      demoLink: { token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/), expiresOn: '2026-11-07' },
    });
  });

  it('answers the same 202 with a link for an e-mail no account has, which signs up (D107)', async () => {
    const known = await ask({ email: AINO });
    const fresh = await ask({ email: 'New.Person@example.com' });
    expect(fresh.status).toBe(202);
    expect(fresh.body.data).toEqual({
      sent: true,
      demoLink: { token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/), expiresOn: '2026-11-07' },
    });
    expect(Object.keys(fresh.body.data)).toEqual(Object.keys(known.body.data));
    expect(Object.keys(fresh.body)).toEqual(Object.keys(known.body));
    const account = await holder.db.account.findUnique({
      where: { email: 'new.person@example.com' },
      include: { customer: true },
    });
    expect(account?.customer).toMatchObject({ type: 'consumer', name: 'new.person@example.com' });
  });

  it('review finding 1: an e-mail the body takes never answers 500 at the sign-up', async () => {
    for (const email of ['päivi@example.fi', 'matti@äkäs.fi', 'a@b.c']) {
      const { status, body } = await ask({ email });
      expect(status, email).toBe(202);
      expect((await open(body.data.demoLink.token)).status, email).toBe(200);
    }
  });

  it('signs a new e-mail up while the demo tools are off too, with the same linkless answer', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    const { status, body } = await ask({ email: 'new.person@example.com' });
    expect(status).toBe(202);
    expect(body.data).toEqual({ sent: true, demoLink: null });
    expect(await holder.db.account.count({ where: { email: 'new.person@example.com' } })).toBe(1);
    expect((await holder.db.loginToken.findFirst())?.demo_token).toBeNull();
  });

  it('carries no link while the demo tools are off (D94), and stores none in clear', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    const { status, body } = await ask({ email: AINO });
    expect(status).toBe(202);
    expect(body.data).toEqual({ sent: true, demoLink: null });
    const row = await holder.db.loginToken.findFirst();
    expect(row).not.toBeNull();
    expect(row?.demo_token).toBeNull();
  });

  it('refuses a body that is not an e-mail with 400', async () => {
    expect((await ask({ email: 'aino' })).status).toBe(400);
    expect((await ask({})).status).toBe(400);
    expect((await ask({ email: AINO, extra: 1 })).status).toBe(400);
  });
});

describe('GET and POST /api/login/[token]', () => {
  it('reads the state, then opens the link: a signed cookie for the account’s actor, the e-mail confirmed', async () => {
    const { token } = (await ask({ email: AINO })).body.data.demoLink;
    expect(await read(token)).toMatchObject({
      status: 200,
      body: {
        data: {
          outcome: 'valid',
          emailMasked: 'a•••@example.com',
          sentOn: TODAY,
          expiresOn: '2026-11-07',
        },
      },
    });

    const { status, cookies, body } = await open(token);
    expect(status).toBe(200);
    expect(body.data).toEqual({ actor: 'cust-aino', emailConfirmed: true, confirmedNow: true });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      new RegExp(`^${ACTOR_COOKIE}=[^;]+; Path=/; Max-Age=2592000; HttpOnly`)
    );
    const signed = decodeURIComponent(cookies[0]!.split(';')[0]!.slice(ACTOR_COOKIE.length + 1));
    expect(verifySession(signed, sessionSecret(), Math.floor(Date.now() / 1000))?.actor).toBe(
      'cust-aino'
    );
    expect((await read(token)).body.data.outcome).toBe('used');
  });

  it('a sign-up’s link signs in as the new customer and confirms the e-mail (D107)', async () => {
    const { token } = (await ask({ email: 'new.person@example.com' })).body.data.demoLink;
    expect((await read(token)).body.data).toMatchObject({
      outcome: 'valid',
      emailMasked: 'n•••@example.com',
    });
    const { status, cookies, body } = await open(token);
    expect(status).toBe(200);
    const account = await holder.db.account.findUniqueOrThrow({
      where: { email: 'new.person@example.com' },
    });
    expect(body.data).toEqual({
      actor: account.customer_id,
      emailConfirmed: true,
      confirmedNow: true,
    });
    expect(account).toMatchObject({ email_confirmed: true, confirmed_on: TODAY });
    const signed = decodeURIComponent(cookies[0]!.split(';')[0]!.slice(ACTOR_COOKIE.length + 1));
    expect(await resolveActor(holder.db, signed)).toBe(account.customer_id);
  });

  it('answers 409 LOGIN_LINK_USED the second time, with no cookie', async () => {
    const { token } = (await ask({ email: AINO })).body.data.demoLink;
    await open(token);
    const again = await open(token);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('LOGIN_LINK_USED');
    expect(again.cookies).toEqual([]);
  });

  it('answers 410 LOGIN_LINK_EXPIRED once the demo clock passes the expiry', async () => {
    const { token } = (await ask({ email: AINO })).body.data.demoLink;
    holder.cookies.set(DEMO_CLOCK_COOKIE, '2026-11-07');
    expect((await read(token)).body.data.outcome).toBe('expired');
    const late = await open(token);
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe('LOGIN_LINK_EXPIRED');
    expect(late.cookies).toEqual([]);
  });

  it('answers 404 for a token nobody made and 400 for one of the wrong shape', async () => {
    expect((await read('C'.repeat(32))).status).toBe(404);
    const unknown = await open('C'.repeat(32));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('LOGIN_LINK_NOT_FOUND');
    expect((await open('short')).status).toBe(400);
  });
});
