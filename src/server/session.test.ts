// The signed session (D92): what a cookie value must carry to name an actor.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  newSession,
  SESSION_MAX_AGE_SECONDS,
  SESSION_SECRET_MIN_LENGTH,
  sessionSecret,
  signSession,
  verifySession,
} from './session';

const SECRET = 'test-secret-with-enough-length-0123456789';
const NOW = 1_800_000_000; // seconds, far enough from any real "now" to be obvious in a failure

describe('signSession and verifySession', () => {
  it('round-trips an actor and its expiry', () => {
    const value = signSession({ actor: 'cust-aino', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(value, SECRET, NOW)).toEqual({ actor: 'cust-aino', expiresAt: NOW + 60 });
  });

  it('writes three dot-separated parts with the actor in base64url', () => {
    const value = signSession({ actor: 'admin', expiresAt: NOW }, SECRET);
    const parts = value.split('.');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0]!, 'base64url').toString()).toBe('admin');
    expect(parts[1]).toBe(String(NOW));
    expect(parts[2]).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes of HMAC-SHA256
  });

  it('is deterministic for the same input and secret', () => {
    const session = { actor: 'cust-aino', expiresAt: NOW };
    expect(signSession(session, SECRET)).toBe(signSession(session, SECRET));
  });

  it('refuses a session that has expired, on the second itself too', () => {
    const value = signSession({ actor: 'cust-aino', expiresAt: NOW }, SECRET);
    expect(verifySession(value, SECRET, NOW)).toBeNull();
    expect(verifySession(value, SECRET, NOW - 1)).not.toBeNull();
  });

  it('refuses a value signed with another secret', () => {
    const value = signSession({ actor: 'admin', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(value, 'another-secret', NOW)).toBeNull();
  });

  it('refuses a value whose actor or expiry was edited after signing', () => {
    const value = signSession({ actor: 'cust-aino', expiresAt: NOW + 60 }, SECRET);
    const [actor, expires, sig] = value.split('.') as [string, string, string];
    const admin = Buffer.from('admin').toString('base64url');
    expect(verifySession(`${admin}.${expires}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySession(`${actor}.${NOW + 3600}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('refuses a plain actor id, the old unsigned cookie', () => {
    expect(verifySession('admin', SECRET, NOW)).toBeNull();
    expect(verifySession('cust-aino', SECRET, NOW)).toBeNull();
  });

  it('refuses a malformed value without throwing', () => {
    for (const value of [
      '',
      '.',
      '..',
      'a.b',
      'a.b.c.d',
      'YWRtaW4=.notanumber.sig',
      'YWRtaW4.1.***',
    ]) {
      expect(verifySession(value, SECRET, NOW)).toBeNull();
    }
  });

  it('refuses a signature of the wrong length rather than comparing it', () => {
    const value = signSession({ actor: 'admin', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(`${value}AA`, SECRET, NOW)).toBeNull();
    expect(verifySession(value.slice(0, -1), SECRET, NOW)).toBeNull();
  });

  it('refuses the same signature written in standard base64 (+ / =) or over a padded actor', () => {
    const expires = NOW + 60;
    const actorUrl = Buffer.from('admin').toString('base64url'); // YWRtaW4
    const hmac = (payload: string) => createHmac('sha256', SECRET).update(payload).digest();
    // The right bytes, the wrong alphabet: Node would decode them to the same signature.
    const standard = hmac(`${actorUrl}.${expires}`).toString('base64');
    expect(verifySession(`${actorUrl}.${expires}.${standard}`, SECRET, NOW)).toBeNull();
    // A correctly signed payload whose actor part is padded standard base64 (YWRtaW4=).
    const padded = 'YWRtaW4=';
    const sig = hmac(`${padded}.${expires}`).toString('base64url');
    expect(verifySession(`${padded}.${expires}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('refuses another spelling of the same signature bytes (the last character’s low bits)', () => {
    const value = signSession({ actor: 'admin', expiresAt: NOW + 60 }, SECRET);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = value.slice(-1);
    const twin = alphabet[alphabet.indexOf(last) ^ 1]!; // same high bits, so the same 32 bytes
    expect(Buffer.from(value.split('.')[2]!.slice(0, -1) + twin, 'base64url')).toEqual(
      Buffer.from(value.split('.')[2]!, 'base64url')
    );
    expect(verifySession(value.slice(0, -1) + twin, SECRET, NOW)).toBeNull();
  });

  it('verifies nothing without a secret or without a value', () => {
    const value = signSession({ actor: 'admin', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(value, null, NOW)).toBeNull();
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
  });

  it('refuses an empty actor', () => {
    const value = signSession({ actor: '', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(value, SECRET, NOW)).toBeNull();
  });

  it('keeps an actor with a dot in it whole', () => {
    const value = signSession({ actor: 'signatory:a.b@example.com', expiresAt: NOW + 60 }, SECRET);
    expect(verifySession(value, SECRET, NOW)?.actor).toBe('signatory:a.b@example.com');
  });

  it('refuses a negative or fractional expiry when signing', () => {
    expect(() => signSession({ actor: 'admin', expiresAt: -1 }, SECRET)).toThrow();
    expect(() => signSession({ actor: 'admin', expiresAt: 1.5 }, SECRET)).toThrow();
  });
});

describe('newSession', () => {
  it('lasts 30 days from now', () => {
    expect(newSession('cust-aino', NOW)).toEqual({
      actor: 'cust-aino',
      expiresAt: NOW + SESSION_MAX_AGE_SECONDS,
    });
    expect(SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
  });
});

describe('sessionSecret', () => {
  it('reads SESSION_SECRET and treats empty, blank or missing as none', () => {
    expect(sessionSecret({ SESSION_SECRET: SECRET })).toBe(SECRET);
    expect(sessionSecret({ SESSION_SECRET: '' })).toBeNull();
    expect(sessionSecret({ SESSION_SECRET: '   ' })).toBeNull();
    expect(sessionSecret({})).toBeNull();
  });

  it('treats a secret shorter than 32 characters as none', () => {
    expect(SESSION_SECRET_MIN_LENGTH).toBe(32);
    expect(sessionSecret({ SESSION_SECRET: 'abc' })).toBeNull();
    expect(sessionSecret({ SESSION_SECRET: 'x'.repeat(31) })).toBeNull();
    expect(sessionSecret({ SESSION_SECRET: 'x'.repeat(32) })).toBe('x'.repeat(32));
    expect(sessionSecret({ SESSION_SECRET: ` ${'x'.repeat(32)} ` })).toBe('x'.repeat(32));
  });
});
