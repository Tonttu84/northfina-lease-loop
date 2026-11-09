// Creates .env from .env.example when .env is missing, then makes sure it holds the audit
// log's signing key (D81) and the actor cookie's session secret (D92): generated here and
// written only to .env, which git ignores. Never overwrites an existing .env value.
// Usage: node scripts/ensure-env.mjs
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} root folder that holds .env.example
 * @returns {'created' | 'exists'}
 */
export function ensureEnvFile(root) {
  const target = join(root, '.env');
  if (existsSync(target)) return 'exists';
  copyFileSync(join(root, '.env.example'), target);
  return 'created';
}

/** A new Ed25519 private key as base64 PKCS#8 DER, the form AUDIT_SIGNING_KEY takes. */
export function newSigningKey() {
  return generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64');
}

/** A new session secret: 32 random bytes as base64url, the form SESSION_SECRET takes. */
export function newSessionSecret() {
  return randomBytes(32).toString('base64url');
}

/**
 * Fills an empty `NAME=""` line of `root/.env`, or appends one, with `make()`. A value already
 * there is kept (`exists`; `short` when it is under `minLength`, so the caller can warn); a
 * value the process environment already provides is not written at all (`provided`): a
 * deployment that sets its secrets in the environment keeps them out of the file.
 * @param {string} root folder that holds .env
 * @param {string} name the variable
 * @param {() => string} make
 * @param {{ minLength?: number, env?: Record<string, string | undefined> }} [options]
 * @returns {'added' | 'exists' | 'short' | 'provided'}
 */
export function ensureEnvValue(root, name, make, { minLength = 1, env = process.env } = {}) {
  if ((env[name] ?? '').trim() !== '') return 'provided';
  const target = join(root, '.env');
  const text = readFileSync(target, 'utf8');
  const linePattern = new RegExp(`^${name}=(.*)$`, 'm');
  const match = linePattern.exec(text);
  const present = match ? match[1].replace(/["'\s]/g, '') : '';
  if (present !== '') return present.length >= minLength ? 'exists' : 'short';
  const line = `${name}="${make()}"`;
  const next = match
    ? text.replace(linePattern, line)
    : `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
  writeFileSync(target, next);
  return 'added';
}

/** The least a session secret may be; `src/server/session.ts` treats a shorter one as none. */
export const SESSION_SECRET_MIN_LENGTH = 32;

/**
 * The audit key (D81). A key already there is kept: a new key would make every signed row read
 * as forged.
 * @param {string} root folder that holds .env
 * @param {() => string} [makeKey]
 * @param {Record<string, string | undefined>} [env]
 * @returns {'added' | 'exists' | 'short' | 'provided'}
 */
export function ensureSigningKey(root, makeKey = newSigningKey, env = process.env) {
  return ensureEnvValue(root, 'AUDIT_SIGNING_KEY', makeKey, { env });
}

/**
 * The session secret (D92). A secret already there is kept, even a short one, since a new one
 * signs everyone out; the caller warns about a short one, which the app treats as none.
 * @param {string} root folder that holds .env
 * @param {() => string} [makeSecret]
 * @param {Record<string, string | undefined>} [env]
 * @returns {'added' | 'exists' | 'short' | 'provided'}
 */
export function ensureSessionSecret(root, makeSecret = newSessionSecret, env = process.env) {
  return ensureEnvValue(root, 'SESSION_SECRET', makeSecret, {
    minLength: SESSION_SECRET_MIN_LENGTH,
    env,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = ensureEnvFile(process.cwd());
  console.log(result === 'created' ? '📝 Created .env from .env.example' : '✔ .env already exists');
  if (ensureSigningKey(process.cwd()) === 'added') {
    console.log('🔑 Added a new AUDIT_SIGNING_KEY to .env (never commit it)');
  }
  const secret = ensureSessionSecret(process.cwd());
  if (secret === 'added') console.log('🔑 Added a new SESSION_SECRET to .env (never commit it)');
  if (secret === 'short') {
    console.warn(
      `⚠️  SESSION_SECRET in .env is shorter than ${SESSION_SECRET_MIN_LENGTH} characters: the app treats it as missing. Empty the line and run this again.`
    );
  }
}
