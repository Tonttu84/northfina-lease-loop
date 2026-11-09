// The sign-in link's rules (D93, D94) on card 1's day, 5 November 2026.
import { describe, expect, it } from 'vitest';
import {
  actorOfAccount,
  hashLoginToken,
  LOGIN_LINK_VALID_DAYS,
  loginLinkExpiresOn,
  loginLinkOutcome,
  maskEmail,
} from './login-link';

const SENT = '2026-11-05';

describe('loginLinkExpiresOn', () => {
  it('is two days after the day the link is sent, so it works today and tomorrow', () => {
    expect(LOGIN_LINK_VALID_DAYS).toBe(2);
    expect(loginLinkExpiresOn(SENT)).toBe('2026-11-07');
  });

  it('crosses a month and a year end', () => {
    expect(loginLinkExpiresOn('2026-11-30')).toBe('2026-12-02');
    expect(loginLinkExpiresOn('2026-12-31')).toBe('2027-01-02');
  });
});

describe('hashLoginToken', () => {
  it('is the SHA-256 of the token as 64 hex digits, the same every time', () => {
    const hash = hashLoginToken('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashLoginToken('abc')).toBe(hash);
  });

  it('differs for a token one character off', () => {
    expect(hashLoginToken('abc')).not.toBe(hashLoginToken('abd'));
  });
});

describe('loginLinkOutcome', () => {
  const link = { sentOn: SENT, expiresOn: loginLinkExpiresOn(SENT), usedOn: null };

  it('is valid on the day it is sent and the day after', () => {
    expect(loginLinkOutcome(link, '2026-11-05')).toBe('valid');
    expect(loginLinkOutcome(link, '2026-11-06')).toBe('valid');
  });

  it('is expired on its expiry day and after', () => {
    expect(loginLinkOutcome(link, '2026-11-07')).toBe('expired');
    expect(loginLinkOutcome(link, '2027-01-01')).toBe('expired');
  });

  it('is expired before the day it was sent (the demo clock moved back)', () => {
    expect(loginLinkOutcome(link, '2026-11-04')).toBe('expired');
  });

  it('is used once opened, whatever the day, before expired', () => {
    const used = { ...link, usedOn: '2026-11-05' };
    expect(loginLinkOutcome(used, '2026-11-05')).toBe('used');
    expect(loginLinkOutcome(used, '2026-11-06')).toBe('used');
    expect(loginLinkOutcome(used, '2026-11-20')).toBe('used');
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('aino.virtanen@example.com')).toBe('a•••@example.com');
    expect(maskEmail('it@kettukoodi.example.com')).toBe('i•••@kettukoodi.example.com');
  });

  it('shows nothing of a value that is not an e-mail', () => {
    expect(maskEmail('aino')).toBe('•••');
    expect(maskEmail('@example.com')).toBe('•••');
  });
});

describe('actorOfAccount', () => {
  it('is admin for the back office and the customer id for a customer', () => {
    expect(actorOfAccount({ role: 'admin', customerId: null })).toBe('admin');
    expect(actorOfAccount({ role: 'customer', customerId: 'cust-aino' })).toBe('cust-aino');
  });

  it('refuses a customer account that names no customer', () => {
    expect(() => actorOfAccount({ role: 'customer', customerId: null })).toThrow();
  });
});
