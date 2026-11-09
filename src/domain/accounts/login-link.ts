// The sign-in link (D93, D94): a visitor types their e-mail, a link is made for the account with
// that e-mail, opening it signs them in and confirms the e-mail. Pure rules: how long a link
// lives, what state it is in on a day, how the token is stored, what the link page may show.
// The token itself is made on the server (`randomBytes`); only its hash is stored (D94).
import { createHash } from 'node:crypto';
import { addDays } from '@/domain/civil-days';

/** A link works on the day it is sent and the next day: it expires on, not including, day + 2. */
export const LOGIN_LINK_VALID_DAYS = 2;

/** The day a link sent on `sentOn` stops working (exclusive). */
export function loginLinkExpiresOn(sentOn: string): string {
  return addDays(sentOn, LOGIN_LINK_VALID_DAYS);
}

/** SHA-256 of the token as hex: what the database holds and what a lookup computes. */
export function hashLoginToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export type LoginLinkDays = {
  sentOn: string;
  expiresOn: string;
  usedOn: string | null;
};

/**
 * `valid`: opens and signs in today. `used`: opened once already, whatever the day (a link is
 * single use). `expired`: today is on or after `expiresOn`, or before `sentOn` (the demo clock
 * moved back before the link existed).
 */
export type LoginLinkOutcome = 'valid' | 'used' | 'expired';

export function loginLinkOutcome(days: LoginLinkDays, today: string): LoginLinkOutcome {
  if (days.usedOn !== null) return 'used';
  if (today < days.sentOn || today >= days.expiresOn) return 'expired';
  return 'valid';
}

/**
 * The e-mail as the link page shows it to whoever holds the link: the first character of the
 * local part, then `•••`, then the domain. `a•••@example.com`.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

export type AccountIdentity = { role: 'customer' | 'admin'; customerId: string | null };

/** The actor an account signs in as (D17's actor string): `admin`, or the customer's id. */
export function actorOfAccount(account: AccountIdentity): string {
  if (account.role === 'admin') return 'admin';
  if (account.customerId === null) throw new Error('a customer account names its customer');
  return account.customerId;
}
