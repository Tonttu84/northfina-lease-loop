import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureEnvFile,
  ensureSessionSecret as ensureSessionSecretWithEnv,
  ensureSigningKey as ensureSigningKeyWithEnv,
  newSessionSecret,
  newSigningKey,
} from './ensure-env.mjs';

// The process carries AUDIT_SIGNING_KEY and SESSION_SECRET under Vitest (vitest.config.ts);
// these tests look at the file, so they pass an empty environment unless they test that case.
const ensureSigningKey = (dir, make, env = {}) => ensureSigningKeyWithEnv(dir, make, env);

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ensure-env-'));
  writeFileSync(path.join(root, '.env.example'), 'DATABASE_URL="file:./dev.db"\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ensureEnvFile', () => {
  it('copies .env.example to .env when .env is missing', () => {
    expect(ensureEnvFile(root)).toBe('created');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./dev.db"\n');
  });

  it('never overwrites an existing .env', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="file:./mine.db"\n');
    expect(ensureEnvFile(root)).toBe('exists');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./mine.db"\n');
  });
});

describe('ensureSigningKey (D81)', () => {
  const env = () => readFileSync(path.join(root, '.env'), 'utf8');
  const fixedKey = () => 'KEY123';

  it('fills the empty placeholder that .env.example carries', () => {
    writeFileSync(
      path.join(root, '.env'),
      'DATABASE_URL="x"\nAUDIT_SIGNING_KEY=""\nDEMO_TOOLS="1"\n'
    );
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\nDEMO_TOOLS="1"\n');
  });

  it('appends a key to an older .env without the line, on a line of its own', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="x"');
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\n');
  });

  it('never replaces a key that is there', () => {
    writeFileSync(path.join(root, '.env'), 'AUDIT_SIGNING_KEY="mine"\n');
    expect(ensureSigningKey(root, fixedKey)).toBe('exists');
    expect(env()).toBe('AUDIT_SIGNING_KEY="mine"\n');
  });

  it('generates a base64 PKCS#8 Ed25519 key by default', () => {
    expect(newSigningKey()).toMatch(/^MC4CAQAwBQYDK2VwBCIEI[A-Za-z0-9+/]{43}$/);
  });
});

describe('ensureSessionSecret (D92)', () => {
  const env = () => readFileSync(path.join(root, '.env'), 'utf8');
  const fixedSecret = () => 'SECRET123';
  // Vitest gives the process a SESSION_SECRET (vitest.config.ts); these tests look at the file.
  const ensureSessionSecret = (dir, make) => ensureSessionSecretWithEnv(dir, make, {});

  it('fills the empty placeholder and leaves the key alone', () => {
    writeFileSync(path.join(root, '.env'), 'AUDIT_SIGNING_KEY="mine"\nSESSION_SECRET=""\n');
    expect(ensureSessionSecret(root, fixedSecret)).toBe('added');
    expect(env()).toBe('AUDIT_SIGNING_KEY="mine"\nSESSION_SECRET="SECRET123"\n');
  });

  it('appends the line to an older .env without it', () => {
    writeFileSync(path.join(root, '.env'), 'AUDIT_SIGNING_KEY="mine"\n');
    expect(ensureSessionSecret(root, fixedSecret)).toBe('added');
    expect(env()).toBe('AUDIT_SIGNING_KEY="mine"\nSESSION_SECRET="SECRET123"\n');
  });

  it('never replaces a secret that is there', () => {
    const mine = 'm'.repeat(43);
    writeFileSync(path.join(root, '.env'), `SESSION_SECRET="${mine}"\n`);
    expect(ensureSessionSecret(root, fixedSecret)).toBe('exists');
    expect(env()).toBe(`SESSION_SECRET="${mine}"\n`);
  });

  it('generates 32 random bytes as base64url by default, different each time', () => {
    expect(newSessionSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionSecret()).not.toBe(newSessionSecret());
  });

  it('keeps a short secret but says so, since the app will treat it as missing', () => {
    writeFileSync(path.join(root, '.env'), 'SESSION_SECRET="keep"\n');
    expect(ensureSessionSecret(root, fixedSecret)).toBe('short');
    expect(env()).toBe('SESSION_SECRET="keep"\n');
    writeFileSync(path.join(root, '.env'), `SESSION_SECRET="${'x'.repeat(32)}"\n`);
    expect(ensureSessionSecret(root, fixedSecret)).toBe('exists');
  });

  it('writes nothing when the process environment provides the variable', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="x"\n');
    expect(ensureSessionSecretWithEnv(root, fixedSecret, { SESSION_SECRET: 'y'.repeat(40) })).toBe(
      'provided'
    );
    expect(ensureSigningKey(root, fixedSecret, { AUDIT_SIGNING_KEY: 'k' })).toBe('provided');
    expect(env()).toBe('DATABASE_URL="x"\n');
  });
});
