// Accounts and the sign-in link (D93, D94) against a real, migrated SQLite database, on card
// 1's day: the seed, asking for a link, the link's state, opening it (signed in, the e-mail
// confirmed, once), the demo outbox, and the sign-up of an e-mail no account has (D107).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import { hashLoginToken } from '@/domain/accounts/login-link';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  accountOfActor,
  ADMIN_ACCOUNT_EMAIL,
  consumeLoginLink,
  listDemoOutbox,
  loginLinkState,
  OUTBOX_LIMIT,
  requestLoginLink,
  seedAccounts,
} from './accounts';
import { resolveKnownActor } from './actor';
import { getCustomer, listCustomers, seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

const TODAY = '2026-11-05';
const AINO = 'aino.virtanen@example.com';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  const customers = await loadCustomers();
  await seedCustomers(db, customers);
  await seedAccounts(db, customers);
});

const request = (email: string, demoTools = true, today = TODAY) =>
  requestLoginLink(db, { email, today, demoTools });

describe('seedAccounts', () => {
  it('makes one unconfirmed account per customer and one for the back office, once', async () => {
    const customers = await loadCustomers();
    expect(await db.account.count()).toBe(customers.length + 1);
    const aino = await db.account.findUnique({ where: { email: AINO } });
    expect(aino).toMatchObject({
      customer_id: 'cust-aino',
      role: 'customer',
      email_confirmed: false,
      confirmed_on: null,
    });
    expect(await db.account.findFirst({ where: { role: 'admin' } })).toMatchObject({
      customer_id: null,
      email: ADMIN_ACCOUNT_EMAIL,
    });
    expect(await seedAccounts(db, customers)).toEqual({
      created: 0,
      skipped: customers.length + 1,
    });
  });

  it('never resets a confirmed e-mail on a reseed', async () => {
    const { link } = await request(AINO);
    await consumeLoginLink(db, { token: link.token, today: TODAY });
    await seedAccounts(db, await loadCustomers());
    expect((await db.account.findUnique({ where: { email: AINO } }))?.email_confirmed).toBe(true);
  });
});

describe('accountOfActor', () => {
  it("names the customer's account, the back office account for admin, nothing for anonymous", async () => {
    expect(await accountOfActor(db, 'cust-aino')).toMatchObject({
      customerId: 'cust-aino',
      role: 'customer',
      email: AINO,
      emailConfirmed: false,
      confirmedOn: null,
    });
    expect(await accountOfActor(db, 'admin')).toMatchObject({ role: 'admin', customerId: null });
    expect(await accountOfActor(db, 'anonymous')).toBeNull();
    expect(await accountOfActor(db, 'cust-nobody')).toBeNull();
  });
});

describe('requestLoginLink', () => {
  it('makes a link for the account with that e-mail: the token once, its hash stored, two days', async () => {
    const { link } = await request(AINO);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(link.expiresOn).toBe('2026-11-07');
    const row = await db.loginToken.findUnique({
      where: { token_hash: hashLoginToken(link.token) },
    });
    expect(row).toMatchObject({
      account_id: link.accountId,
      demo_token: link.token,
      sent_on: TODAY,
      expires_on: '2026-11-07',
      used_on: null,
    });
    expect(await db.loginToken.findFirst({ where: { token_hash: link.token } })).toBeNull();
  });

  it('keeps no token in clear while the demo tools are off (D94)', async () => {
    const { link } = await request(AINO, false);
    const row = await db.loginToken.findUnique({
      where: { token_hash: hashLoginToken(link.token) },
    });
    expect(row?.demo_token).toBeNull();
  });

  it('finds the account by the e-mail trimmed and in lower case', async () => {
    const { link } = await request('  Aino.Virtanen@Example.com ');
    expect(link.accountId).toBe((await db.account.findUnique({ where: { email: AINO } }))?.id);
  });

  it('writes one audit row per link, actor anonymous, naming the account', async () => {
    const { link } = await request(AINO);
    const rows = await db.auditLog.findMany({ where: { action: 'account.login_link_sent' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'anonymous',
      entity_type: 'account',
      entity_id: link.accountId,
    });
    expect(JSON.parse(rows[0]!.details_json ?? '{}')).toEqual({
      email: AINO,
      expiresOn: '2026-11-07',
      demoOutbox: true,
    });
  });

  it('refuses what is not an e-mail', async () => {
    await expect(request('aino')).rejects.toThrow();
  });
});

describe('requestLoginLink for an e-mail no account has: the sign-up (D107)', () => {
  const NEW = 'new.person@example.com';

  it('makes a blank consumer customer, its unconfirmed account and the link, in one audited change', async () => {
    const audits = await db.auditLog.count();
    const { link, signedUp } = await request(NEW);
    expect(signedUp).toBe(true);
    const account = await db.account.findUniqueOrThrow({ where: { email: NEW } });
    expect(account).toMatchObject({
      id: link.accountId,
      role: 'customer',
      email_confirmed: false,
      confirmed_on: null,
    });
    expect(account.customer_id).toMatch(/^cust-[0-9a-f]{16}$/);
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: account.customer_id! } })
    ).toMatchObject({
      type: 'consumer',
      name: NEW,
      email: NEW,
      birth_date: null,
      country: null,
      city: null,
      employment: null,
      monthly_net_income_cents: null,
      business_id: null,
      is_pep: false,
      story: 'Signed up in the app with this e-mail on 2026-11-05.',
    });
    expect(
      await db.loginToken.findUnique({ where: { token_hash: hashLoginToken(link.token) } })
    ).toMatchObject({ account_id: account.id, demo_token: link.token, expires_on: '2026-11-07' });
    expect(await db.auditLog.count()).toBe(audits + 1);
    const row = await db.auditLog.findFirstOrThrow({ where: { action: 'account.signed_up' } });
    expect(row).toMatchObject({
      actor: 'anonymous',
      entity_type: 'account',
      entity_id: account.id,
    });
    expect(JSON.parse(row.details_json ?? '{}')).toEqual({
      email: NEW,
      customerId: account.customer_id,
      expiresOn: '2026-11-07',
      demoOutbox: true,
    });
  });

  it('signs up with the demo tools off too, keeping no token in clear', async () => {
    const { link, signedUp } = await request(NEW, false);
    expect(signedUp).toBe(true);
    expect(await db.customer.count({ where: { email: NEW } })).toBe(1);
    expect(
      (await db.loginToken.findUnique({ where: { token_hash: hashLoginToken(link.token) } }))
        ?.demo_token
    ).toBeNull();
  });

  it('stores the e-mail trimmed and in lower case, on the account and on the customer', async () => {
    await request('  New.Person@Example.COM ');
    expect(await db.account.count({ where: { email: NEW } })).toBe(1);
    expect(await db.customer.count({ where: { email: NEW, name: NEW } })).toBe(1);
  });

  it('a known e-mail is not a sign-up, and a second request for the new one is a plain link', async () => {
    expect((await request(AINO)).signedUp).toBe(false);
    const first = await request(NEW);
    const second = await request(NEW);
    expect(second.signedUp).toBe(false);
    expect(second.link.accountId).toBe(first.link.accountId);
    expect(await db.customer.count({ where: { email: NEW } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'account.signed_up' } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'account.login_link_sent' } })).toBe(2);
  });

  it('two requests at once for one new e-mail: one customer, one account, two links', async () => {
    const results = await Promise.all([request(NEW), request(NEW)]);
    expect(results.filter((result) => result.signedUp)).toHaveLength(1);
    expect(results[0]!.link.accountId).toBe(results[1]!.link.accountId);
    expect(results[0]!.link.token).not.toBe(results[1]!.link.token);
    expect(await db.customer.count({ where: { email: NEW } })).toBe(1);
    expect(await db.account.count({ where: { email: NEW } })).toBe(1);
    expect(await db.loginToken.count()).toBe(2);
    expect(await db.auditLog.count({ where: { action: 'account.signed_up' } })).toBe(1);
  });

  it('the new customer reads back in the app’s record shape and is a known actor', async () => {
    const { link } = await request(NEW);
    const { customer_id: id } = await db.account.findUniqueOrThrow({
      where: { id: link.accountId },
    });
    expect(await getCustomer(db, id!)).toEqual({
      id,
      type: 'consumer',
      name: NEW,
      email: NEW,
      is_pep: false,
      story: 'Signed up in the app with this e-mail on 2026-11-05.',
    });
    expect((await listCustomers(db)).map((customer) => customer.id)).toContain(id);
    expect(await resolveKnownActor(db, id!)).toBe(id);
    expect(await accountOfActor(db, id!)).toMatchObject({ email: NEW, emailConfirmed: false });
  });

  it('opening the link signs in as the new customer and confirms the e-mail', async () => {
    const { link } = await request(NEW);
    const account = await db.account.findUniqueOrThrow({ where: { id: link.accountId } });
    expect(await consumeLoginLink(db, { token: link.token, today: '2026-11-06' })).toEqual({
      ok: true,
      actor: account.customer_id,
      confirmedNow: true,
    });
    expect(await db.account.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({
      email_confirmed: true,
      confirmed_on: '2026-11-06',
    });
  });

  it('the outbox shows the sign-up’s link under its e-mail, the name it has', async () => {
    const { link } = await request(NEW);
    expect((await listDemoOutbox(db, TODAY))[0]).toMatchObject({
      token: link.token,
      email: NEW,
      customerName: NEW,
    });
  });

  it('refuses what is not an e-mail and makes nothing', async () => {
    await expect(request('new.person')).rejects.toThrow();
    expect(await db.customer.count()).toBe((await loadCustomers()).length);
  });
});

describe('loginLinkState', () => {
  it('is valid today and tomorrow, expired after, with the e-mail masked', async () => {
    const { link } = await request(AINO);
    expect(await loginLinkState(db, link.token, TODAY)).toEqual({
      outcome: 'valid',
      emailMasked: 'a•••@example.com',
      sentOn: TODAY,
      expiresOn: '2026-11-07',
    });
    expect((await loginLinkState(db, link.token, '2026-11-06'))?.outcome).toBe('valid');
    expect((await loginLinkState(db, link.token, '2026-11-07'))?.outcome).toBe('expired');
  });

  it('is null for a token nobody made', async () => {
    expect(await loginLinkState(db, 'A'.repeat(32), TODAY)).toBeNull();
  });
});

describe('consumeLoginLink', () => {
  it('signs in as the customer, confirms the e-mail with the day, marks the link used, one audit row', async () => {
    const { link } = await request(AINO);
    const result = await consumeLoginLink(db, { token: link.token, today: TODAY });
    expect(result).toEqual({ ok: true, actor: 'cust-aino', confirmedNow: true });
    expect(await db.account.findUnique({ where: { email: AINO } })).toMatchObject({
      email_confirmed: true,
      confirmed_on: TODAY,
    });
    expect(
      (await db.loginToken.findUnique({ where: { token_hash: hashLoginToken(link.token) } }))
        ?.used_on
    ).toBe(TODAY);
    const rows = await db.auditLog.findMany({ where: { action: 'account.signed_in' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: 'cust-aino', entity_type: 'account' });
    expect(JSON.parse(rows[0]!.details_json ?? '{}')).toEqual({ via: 'login_link' });
  });

  it('two opens of one link at once: exactly one signs in, one audit row, the other is used', async () => {
    const { link } = await request(AINO);
    const results = await Promise.all([
      consumeLoginLink(db, { token: link.token, today: TODAY }),
      consumeLoginLink(db, { token: link.token, today: TODAY }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: 'used' }]);
    expect(await db.auditLog.count({ where: { action: 'account.signed_in' } })).toBe(1);
    expect((await db.account.findUnique({ where: { email: AINO } }))?.confirmed_on).toBe(TODAY);
  });

  it('signs in as admin through the back office account', async () => {
    const { link } = await request(ADMIN_ACCOUNT_EMAIL);
    expect(await consumeLoginLink(db, { token: link.token, today: TODAY })).toEqual({
      ok: true,
      actor: 'admin',
      confirmedNow: true,
    });
  });

  it('a second link leaves the confirmation day as it was', async () => {
    const first = await request(AINO);
    await consumeLoginLink(db, { token: first.link.token, today: TODAY });
    const second = await request(AINO, true, '2026-11-06');
    const result = await consumeLoginLink(db, { token: second.link.token, today: '2026-11-06' });
    expect(result).toEqual({ ok: true, actor: 'cust-aino', confirmedNow: false });
    expect((await db.account.findUnique({ where: { email: AINO } }))?.confirmed_on).toBe(TODAY);
  });

  it('is single use: the second open answers used and changes nothing', async () => {
    const { link } = await request(AINO);
    await consumeLoginLink(db, { token: link.token, today: TODAY });
    const audits = await db.auditLog.count();
    expect(await consumeLoginLink(db, { token: link.token, today: TODAY })).toEqual({
      ok: false,
      reason: 'used',
    });
    expect(await db.auditLog.count()).toBe(audits);
  });

  it('answers expired on the expiry day and before the sent day, not_found for a stranger', async () => {
    const { link } = await request(AINO);
    expect(await consumeLoginLink(db, { token: link.token, today: '2026-11-07' })).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await consumeLoginLink(db, { token: link.token, today: '2026-11-04' })).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await consumeLoginLink(db, { token: 'B'.repeat(32), today: TODAY })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect((await db.account.findUnique({ where: { email: AINO } }))?.email_confirmed).toBe(false);
  });
});

describe('listDemoOutbox', () => {
  it('lists the links valid today, newest first, with the name and the e-mail', async () => {
    const first = await request(AINO);
    const second = await request(ADMIN_ACCOUNT_EMAIL);
    const outbox = await listDemoOutbox(db, TODAY);
    expect(outbox.map((link) => link.token)).toEqual([second.link.token, first.link.token]);
    expect(outbox[1]).toEqual({
      token: first.link.token,
      email: AINO,
      customerName: 'Aino Virtanen',
      customerId: 'cust-aino',
      sentOn: TODAY,
      expiresOn: '2026-11-07',
    });
    expect(outbox[0]).toMatchObject({ customerName: null, customerId: null });
  });

  it('drops a used link, an expired one, and one made with the demo tools off', async () => {
    const used = await request(AINO);
    await consumeLoginLink(db, { token: used.link.token, today: TODAY });
    await request('mikko.laine@example.com', false);
    const old = await request('lena.tamm@example.com', true, '2026-11-01');
    const live = await request('pekka@example.com');
    expect((await listDemoOutbox(db, TODAY)).map((link) => link.token)).toEqual([live.link.token]);
    expect((await listDemoOutbox(db, '2026-11-02')).map((link) => link.token)).toEqual([
      old.link.token,
    ]);
  });

  it('shows at most the limit', async () => {
    for (let i = 0; i < OUTBOX_LIMIT + 3; i++) await request(AINO);
    expect(await listDemoOutbox(db, TODAY)).toHaveLength(OUTBOX_LIMIT);
  });
});
