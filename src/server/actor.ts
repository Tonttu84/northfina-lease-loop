// Who is acting (docs/decisions.md D17). There is no login: the "continue as" picker sets a
// cookie with a customer id or `admin`, and every withAudit entry names that actor. Since D92
// the cookie carries a signed, expiring session (`session.ts`): a value nobody signed, one past
// its expiry or one that names nobody we know reads as `anonymous`.
import { cookies } from 'next/headers';
import { secureFlag } from './cookie-flags';
import { listCustomers } from './customers';
import type { PrismaClient } from './prisma-client';
import {
  newSession,
  SESSION_MAX_AGE_SECONDS,
  sessionSecret,
  signSession,
  verifySession,
} from './session';

export const ACTOR_COOKIE = 'lease-loop-actor';
export const ADMIN_ACTOR = 'admin';
export const ANONYMOUS_ACTOR = 'anonymous';

/** A customer id, `admin` or `anonymous`. */
export type Actor = string;

/**
 * The actor a verified session names: the value itself when it is `admin` or one of `knownIds`,
 * otherwise `anonymous`. Exact match only: no trimming, no case folding.
 */
export function actorFromCookieValue(
  value: string | undefined,
  knownIds: readonly string[]
): Actor {
  if (value === ADMIN_ACTOR) return ADMIN_ACTOR;
  if (value !== undefined && value !== ANONYMOUS_ACTOR && knownIds.includes(value)) return value;
  return ANONYMOUS_ACTOR;
}

/** The secret, or a clear error: a route that sets a session without one is misconfigured. */
function requireSecret(): string {
  const secret = sessionSecret();
  if (secret === null) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters; run `npm run db:setup` to generate one into .env'
    );
  }
  return secret;
}

/** The signed session value for `actor`, starting at `nowMs`. For the cookie and for tests. */
export function sessionCookieValue(actor: Actor, nowMs: number = Date.now()): string {
  return signSession(newSession(actor, Math.floor(nowMs / 1000)), requireSecret());
}

/** `Set-Cookie` value that remembers the actor for 30 days, as a signed session (D92). */
export function actorCookieHeader(actor: Actor, nowMs: number = Date.now()): string {
  return `${ACTOR_COOKIE}=${encodeURIComponent(sessionCookieValue(actor, nowMs))}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secureFlag()}`;
}

/** `Set-Cookie` value that forgets the actor. */
export function clearActorCookieHeader(): string {
  return `${ACTOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag()}`;
}

/**
 * The actor a cookie value names: the signed session is verified against the secret and the
 * clock first (a plain id, the cookie before D92, is nobody), then its actor is checked against
 * the customers in the database. The picker's route checks its plain id with `resolveKnownActor`.
 */
export async function resolveActor(
  db: PrismaClient,
  value: string | undefined,
  nowMs: number = Date.now()
): Promise<Actor> {
  const session = verifySession(value, sessionSecret(), Math.floor(nowMs / 1000));
  return resolveKnownActor(db, session?.actor);
}

/** The actor `value` names if it is `admin` or a customer in the database, else `anonymous`. */
export async function resolveKnownActor(
  db: PrismaClient,
  value: string | undefined
): Promise<Actor> {
  // Through the customers slice's read (team rule 3, review finding 13).
  const customers = await listCustomers(db);
  return actorFromCookieValue(
    value,
    customers.map((customer) => customer.id)
  );
}

/** The actor of the current request. Call it in a page or a route, once, and pass it down. */
export async function readActor(db: PrismaClient): Promise<Actor> {
  const store = await cookies();
  return resolveActor(db, store.get(ACTOR_COOKIE)?.value);
}
