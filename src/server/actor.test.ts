// The actor (D17): a cookie names who is acting, set by the picker or the sign-in link (D93);
// the cookie is a signed, expiring session (D92). Pure parts first, then the reader against a real, migrated SQLite database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  ACTOR_COOKIE,
  actorCookieHeader,
  actorFromCookieValue,
  clearActorCookieHeader,
  resolveActor,
  resolveKnownActor,
  sessionCookieValue,
} from './actor';
import { actorBodySchema } from './routes';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';
import { sessionSecret, signSession, verifySession } from './session';

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

const known = ['cust-aino', 'cust-kettukoodi'];

describe('actorFromCookieValue', () => {
  it('returns a known customer id as it is', () => {
    expect(actorFromCookieValue('cust-aino', known)).toBe('cust-aino');
  });

  it('returns admin for admin', () => {
    expect(actorFromCookieValue('admin', known)).toBe('admin');
  });

  it('falls back to anonymous for an unknown id', () => {
    expect(actorFromCookieValue('cust-nobody', known)).toBe('anonymous');
  });

  it('falls back to anonymous for an empty, blank or missing cookie', () => {
    expect(actorFromCookieValue('', known)).toBe('anonymous');
    expect(actorFromCookieValue('   ', known)).toBe('anonymous');
    expect(actorFromCookieValue(undefined, known)).toBe('anonymous');
  });

  it('does not trim, change case or accept anonymous as a chosen actor', () => {
    expect(actorFromCookieValue(' cust-aino', known)).toBe('anonymous');
    expect(actorFromCookieValue('Admin', known)).toBe('anonymous');
    expect(actorFromCookieValue('anonymous', known)).toBe('anonymous');
  });

  it('knows no customer when the list is empty', () => {
    expect(actorFromCookieValue('cust-aino', [])).toBe('anonymous');
    expect(actorFromCookieValue('admin', [])).toBe('admin');
  });
});

describe('the cookie headers', () => {
  it('sets the actor cookie for the whole site, http only, for 30 days, as a signed session', () => {
    const header = actorCookieHeader('cust-aino', NOW_MS);
    expect(header).toBe(
      `${ACTOR_COOKIE}=${sessionCookieValue('cust-aino', NOW_MS)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
    );
    expect(header).not.toContain('=cust-aino;');
  });

  it('signs a session that lasts as long as the cookie, 30 days from now', () => {
    const session = verifySession(sessionCookieValue('cust-aino', NOW_MS), sessionSecret(), NOW_S);
    expect(session).toEqual({ actor: 'cust-aino', expiresAt: NOW_S + 2_592_000 });
  });

  it('encodes the session for the cookie (no `=` or `;` in the value)', () => {
    const value = actorCookieHeader('admin', NOW_MS)
      .split(';')[0]!
      .slice(ACTOR_COOKIE.length + 1);
    expect(value).toMatch(/^[A-Za-z0-9_.%-]+$/);
    expect(decodeURIComponent(value)).toBe(sessionCookieValue('admin', NOW_MS));
  });

  describe('without SESSION_SECRET', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('refuses to set a session and says what to run', () => {
      vi.stubEnv('SESSION_SECRET', '');
      expect(() => actorCookieHeader('admin')).toThrow(/SESSION_SECRET/);
    });
  });

  it('clears the cookie by expiring it', () => {
    expect(clearActorCookieHeader()).toBe(
      `${ACTOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  });

  describe('on a production build', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('both headers add Secure, so the cookie travels over https only', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(actorCookieHeader('cust-aino')).toMatch(/; SameSite=Lax; Secure$/);
      expect(clearActorCookieHeader()).toMatch(/; SameSite=Lax; Secure$/);
    });
  });
});

describe('actorBodySchema', () => {
  it('accepts { actor } and nothing else', () => {
    expect(actorBodySchema.parse({ actor: 'admin' })).toEqual({ actor: 'admin' });
    expect(actorBodySchema.safeParse({ actor: '' }).success).toBe(false);
    expect(actorBodySchema.safeParse({ actor: 'admin', extra: 1 }).success).toBe(false);
    expect(actorBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('resolveActor', () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    await seedCustomers(db, await loadCustomers());
  });
  afterAll(async () => {
    await cleanup();
  });

  it('reads the actor out of a signed session and checks it against the customers', async () => {
    expect(await resolveActor(db, sessionCookieValue('cust-lena', NOW_MS), NOW_MS)).toBe(
      'cust-lena'
    );
    expect(await resolveActor(db, sessionCookieValue('admin', NOW_MS), NOW_MS)).toBe('admin');
    expect(await resolveActor(db, sessionCookieValue('cust-deleted', NOW_MS), NOW_MS)).toBe(
      'anonymous'
    );
    expect(await resolveActor(db, undefined, NOW_MS)).toBe('anonymous');
  });

  it('reads a plain actor id, the cookie before D92, as anonymous', async () => {
    expect(await resolveActor(db, 'admin', NOW_MS)).toBe('anonymous');
    expect(await resolveActor(db, 'cust-lena', NOW_MS)).toBe('anonymous');
  });

  it('reads a session past its expiry as anonymous', async () => {
    const value = sessionCookieValue('admin', NOW_MS);
    expect(await resolveActor(db, value, NOW_MS + 2_592_000 * 1000)).toBe('anonymous');
  });

  it('reads a session signed with another secret as anonymous', async () => {
    const forged = signSession({ actor: 'admin', expiresAt: NOW_S + 60 }, 'not-the-secret');
    expect(await resolveActor(db, forged, NOW_MS)).toBe('anonymous');
  });

  describe('without SESSION_SECRET', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('trusts no session at all', async () => {
      const value = sessionCookieValue('admin', NOW_MS);
      vi.stubEnv('SESSION_SECRET', '');
      expect(await resolveActor(db, value, NOW_MS)).toBe('anonymous');
    });
  });
});

describe('resolveKnownActor', () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    await seedCustomers(db, await loadCustomers());
  });
  afterAll(async () => {
    await cleanup();
  });

  it("checks a plain actor id against the customers in the database (the picker's choice)", async () => {
    expect(await resolveKnownActor(db, 'cust-lena')).toBe('cust-lena');
    expect(await resolveKnownActor(db, 'admin')).toBe('admin');
    expect(await resolveKnownActor(db, 'cust-deleted')).toBe('anonymous');
    expect(await resolveKnownActor(db, undefined)).toBe('anonymous');
  });
});
