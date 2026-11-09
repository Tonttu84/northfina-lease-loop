import { describe, expect, it } from 'vitest';
import { accountRow, loginTokenRow } from '../../../tests/helpers/row-examples';
import {
  accountConfirmationUpdateSchema,
  accountRowSchema,
  loginTokenRowSchema,
  loginTokenUsedUpdateSchema,
  loginTokenValueSchema,
  tokenHashSchema,
} from './account';

describe('accountRowSchema', () => {
  it('accepts a customer account and the back office account', () => {
    expect(accountRowSchema.parse(accountRow())).toEqual(accountRow());
    const admin = { ...accountRow(), customer_id: null, role: 'admin' };
    expect(accountRowSchema.parse(admin)).toEqual(admin);
  });

  it('stores the e-mail trimmed and in lower case', () => {
    const row = accountRowSchema.parse({ ...accountRow(), email: '  Aino.Virtanen@Example.com ' });
    expect(row.email).toBe('aino.virtanen@example.com');
  });

  it('refuses an admin with a customer and a customer without one', () => {
    expect(accountRowSchema.safeParse({ ...accountRow(), role: 'admin' }).success).toBe(false);
    expect(accountRowSchema.safeParse({ ...accountRow(), customer_id: null }).success).toBe(false);
  });

  it('ties the confirmed flag to its day', () => {
    expect(
      accountRowSchema.safeParse({ ...accountRow(), email_confirmed: true, confirmed_on: null })
        .success
    ).toBe(false);
    expect(
      accountRowSchema.safeParse({ ...accountRow(), confirmed_on: '2026-11-05' }).success
    ).toBe(false);
    expect(
      accountRowSchema.parse({ ...accountRow(), email_confirmed: true, confirmed_on: '2026-11-05' })
        .confirmed_on
    ).toBe('2026-11-05');
  });

  it('refuses what is not an e-mail, an unknown role and an extra column', () => {
    expect(accountRowSchema.safeParse({ ...accountRow(), email: 'aino' }).success).toBe(false);
    expect(accountRowSchema.safeParse({ ...accountRow(), role: 'staff' }).success).toBe(false);
    expect(accountRowSchema.safeParse({ ...accountRow(), password: 'x' }).success).toBe(false);
  });

  it('the confirmation update sets the flag and the day, nothing else', () => {
    expect(
      accountConfirmationUpdateSchema.parse({ email_confirmed: true, confirmed_on: '2026-11-05' })
    ).toEqual({ email_confirmed: true, confirmed_on: '2026-11-05' });
    expect(accountConfirmationUpdateSchema.safeParse({ email_confirmed: false }).success).toBe(
      false
    );
  });
});

describe('loginTokenRowSchema', () => {
  it('accepts a link with and without the demo token', () => {
    expect(loginTokenRowSchema.parse(loginTokenRow())).toEqual(loginTokenRow());
    const production = { ...loginTokenRow(), demo_token: null };
    expect(loginTokenRowSchema.parse(production)).toEqual(production);
  });

  it('wants a 64-digit hex hash, never the token in the hash column', () => {
    expect(tokenHashSchema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(tokenHashSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(
      loginTokenRowSchema.safeParse({ ...loginTokenRow(), token_hash: 'x'.repeat(32) }).success
    ).toBe(false);
  });

  it('wants a url-safe token of 32 to 64 characters', () => {
    expect(loginTokenValueSchema.safeParse('A'.repeat(32)).success).toBe(true);
    expect(loginTokenValueSchema.safeParse('A'.repeat(31)).success).toBe(false);
    expect(loginTokenValueSchema.safeParse('A'.repeat(65)).success).toBe(false);
    expect(loginTokenValueSchema.safeParse(`${'A'.repeat(31)}+`).success).toBe(false);
  });

  it('expires after the day it is sent', () => {
    expect(
      loginTokenRowSchema.safeParse({ ...loginTokenRow(), expires_on: '2026-11-05' }).success
    ).toBe(false);
    expect(
      loginTokenRowSchema.safeParse({ ...loginTokenRow(), expires_on: '2026-11-04' }).success
    ).toBe(false);
  });

  it('the used update sets the day only', () => {
    expect(loginTokenUsedUpdateSchema.parse({ used_on: '2026-11-05' })).toEqual({
      used_on: '2026-11-05',
    });
    expect(loginTokenUsedUpdateSchema.safeParse({ used_on: null }).success).toBe(false);
  });
});
