// The session inside the actor cookie (D92): `actor.expires.signature`, signed with
// SESSION_SECRET so a visitor cannot write `admin` into the cookie by hand, and expiring on its
// own so a copied cookie stops working. The secret is generated into .env by
// `scripts/ensure-env.mjs` and never committed; changing it signs everyone out. Pure here: the
// clock and the secret come in as arguments, `actor.ts` reads them.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Session = {
  actor: string;
  /** Unix time in seconds after which the session is no longer valid. */
  expiresAt: number;
};

/** How long a session lasts: 30 days, the Max-Age of the cookie that carries it. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const ENV_NAME = 'SESSION_SECRET';

/** The secret from the environment, or null when it is empty or missing (then nothing verifies). */
export function sessionSecret(
  env: Record<string, string | undefined> = process.env
): string | null {
  const value = env[ENV_NAME]?.trim();
  return value ? value : null;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/** `base64url(actor).expires.base64url(hmac)`; the actor is encoded so a `.` in it cannot split the value. */
export function signSession(session: Session, secret: string): string {
  if (!Number.isInteger(session.expiresAt) || session.expiresAt < 0) {
    throw new Error('expiresAt must be a non-negative integer of seconds');
  }
  const payload = `${Buffer.from(session.actor, 'utf8').toString('base64url')}.${session.expiresAt}`;
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

/**
 * The session a cookie value carries, or null: no value, no secret, a malformed value, a wrong
 * signature or one past its expiry. The signature is compared in constant time.
 */
export function verifySession(
  value: string | undefined,
  secret: string | null,
  nowSeconds: number
): Session | null {
  if (value === undefined || secret === null) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [actorPart, expiresPart, signaturePart] = parts as [string, string, string];
  if (!/^\d{1,12}$/.test(expiresPart)) return null;
  const expiresAt = Number(expiresPart);
  if (expiresAt <= nowSeconds) return null;
  const expected = signature(`${actorPart}.${expiresPart}`, secret);
  let given: Buffer;
  try {
    given = Buffer.from(signaturePart, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  // base64url is strict about its alphabet; anything else was not written by us.
  if (!/^[A-Za-z0-9_-]*$/.test(actorPart)) return null;
  const actor = Buffer.from(actorPart, 'base64url').toString('utf8');
  return actor === '' ? null : { actor, expiresAt };
}

/** A session for `actor` that starts now and lasts `SESSION_MAX_AGE_SECONDS`. */
export function newSession(actor: string, nowSeconds: number): Session {
  return { actor, expiresAt: nowSeconds + SESSION_MAX_AGE_SECONDS };
}
