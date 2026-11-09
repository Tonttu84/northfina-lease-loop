// Accounts and the sign-in link (D93, D94) against a real, migrated SQLite database, on card
// 1's day: the seed, asking for a link, the link's state, opening it (signed in, the e-mail
// confirmed, once), and the demo outbox.
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
import { seedCustomers } from './customers';
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
    await consumeLoginLink(db, { token: link!.token, today: TODAY });
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
    expect(link).not.toBeNull();
    expect(link!.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(link!.expiresOn).toBe('2026-11-07');
    const row = await db.loginToken.findUnique({
      where: { token_hash: hashLoginToken(link!.token) },
    });
    expect(row).toMatchObject({
      account_id: link!.accountId,
      demo_token: link!.token,
      sent_on: TODAY,
      expires_on: '2026-11-07',
      used_on: null,
    });
    expect(await db.loginToken.findFirst({ where: { token_hash: link!.token } })).toBeNull();
  });

  it('keeps no token in clear while the demo tools are off (D94)', async () => {
    const { link } = await request(AINO, false);
    const row = await db.loginToken.findUnique({
      where: { token_hash: hashLoginToken(link!.token) },
    });
    expect(row?.demo_token).toBeNull();
  });

  it('finds the account by the e-mail trimmed and in lower case', async () => {
    const { link } = await request('  Aino.Virtanen@Example.com ');
    expect(link?.accountId).toBe((await db.account.findUnique({ where: { email: AINO } }))?.id);
  });

  it('makes no row and no audit entry for an e-mail no account has', async () => {
    const before = await db.auditLog.count();
    expect(await request('nobody@example.com')).toEqual({ link: null });
    expect(await db.loginToken.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(before);
  });

  it('writes one audit row per link, actor anonymous, naming the account', async () => {
    const { link } = await request(AINO);
    const rows = await db.auditLog.findMany({ where: { action: 'account.login_link_sent' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'anonymous',
      entity_type: 'account',
      entity_id: link!.accountId,
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

describe('loginLinkState', () => {
  it('is valid today and tomorrow, expired after, with the e-mail masked', async () => {
    const { link } = await request(AINO);
    expect(await loginLinkState(db, link!.token, TODAY)).toEqual({
      outcome: 'valid',
      emailMasked: 'a•••@example.com',
      sentOn: TODAY,
      expiresOn: '2026-11-07',
    });
    expect((await loginLinkState(db, link!.token, '2026-11-06'))?.outcome).toBe('valid');
    expect((await loginLinkState(db, link!.token, '2026-11-07'))?.outcome).toBe('expired');
  });

  it('is null for a token nobody made', async () => {
    expect(await loginLinkState(db, 'A'.repeat(32), TODAY)).toBeNull();
  });
});

describe('consumeLoginLink', () => {
  it('signs in as the customer, confirms the e-mail with the day, marks the link used, one audit row', async () => {
    const { link } = await request(AINO);
    const result = await consumeLoginLink(db, { token: link!.token, today: TODAY });
    expect(result).toEqual({ ok: true, actor: 'cust-aino', confirmedNow: true });
    expect(await db.account.findUnique({ where: { email: AINO } })).toMatchObject({
      email_confirmed: true,
      confirmed_on: TODAY,
    });
    expect(
      (await db.loginToken.findUnique({ where: { token_hash: hashLoginToken(link!.token) } }))
        ?.used_on
    ).toBe(TODAY);
    const rows = await db.auditLog.findMany({ where: { action: 'account.signed_in' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: 'cust-aino', entity_type: 'account' });
    expect(JSON.parse(rows[0]!.details_json ?? '{}')).toEqual({
      via: 'login_link',
      emailConfirmedNow: true,
    });
  });

  it('signs in as admin through the back office account', async () => {
    const { link } = await request(ADMIN_ACCOUNT_EMAIL);
    expect(await consumeLoginLink(db, { token: link!.token, today: TODAY })).toEqual({
      ok: true,
      actor: 'admin',
      confirmedNow: true,
    });
  });

  it('a second link leaves the confirmation day as it was', async () => {
    const first = await request(AINO);
    await consumeLoginLink(db, { token: first.link!.token, today: TODAY });
    const second = await request(AINO, true, '2026-11-06');
    const result = await consumeLoginLink(db, { token: second.link!.token, today: '2026-11-06' });
    expect(result).toEqual({ ok: true, actor: 'cust-aino', confirmedNow: false });
    expect((await db.account.findUnique({ where: { email: AINO } }))?.confirmed_on).toBe(TODAY);
  });

  it('is single use: the second open answers used and changes nothing', async () => {
    const { link } = await request(AINO);
    await consumeLoginLink(db, { token: link!.token, today: TODAY });
    const audits = await db.auditLog.count();
    expect(await consumeLoginLink(db, { token: link!.token, today: TODAY })).toEqual({
      ok: false,
      reason: 'used',
    });
    expect(await db.auditLog.count()).toBe(audits);
  });

  it('answers expired on the expiry day and before the sent day, not_found for a stranger', async () => {
    const { link } = await request(AINO);
    expect(await consumeLoginLink(db, { token: link!.token, today: '2026-11-07' })).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await consumeLoginLink(db, { token: link!.token, today: '2026-11-04' })).toEqual({
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
    expect(outbox.map((link) => link.token)).toEqual([second.link!.token, first.link!.token]);
    expect(outbox[1]).toEqual({
      token: first.link!.token,
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
    await consumeLoginLink(db, { token: used.link!.token, today: TODAY });
    await request('mikko.laine@example.com', false);
    const old = await request('lena.tamm@example.com', true, '2026-11-01');
    const live = await request('pekka@example.com');
    expect((await listDemoOutbox(db, TODAY)).map((link) => link.token)).toEqual([live.link!.token]);
    expect((await listDemoOutbox(db, '2026-11-02')).map((link) => link.token)).toEqual([
      old.link!.token,
    ]);
  });

  it('shows at most the limit', async () => {
    for (let i = 0; i < OUTBOX_LIMIT + 3; i++) await request(AINO);
    expect(await listDemoOutbox(db, TODAY)).toHaveLength(OUTBOX_LIMIT);
  });
});
