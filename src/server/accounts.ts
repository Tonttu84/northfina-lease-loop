// Accounts and the sign-in link (D93, D94). One account per customer and one for the back
// office, seeded from the data pack. A visitor types an e-mail; the account with that e-mail
// gets a single-use link that works today and tomorrow; opening it sets the signed session
// cookie (D92) and confirms the e-mail. No e-mail is sent: while the demo tools are on, the
// token is also kept in clear (`demo_token`) so the demo page's outbox can show the link.
// The owner of the Account and LoginToken tables (team rule 3).
import { randomBytes } from 'node:crypto';
import type { Account as AccountRow, LoginToken as LoginTokenRow } from '@/generated/prisma/client';
import {
  actorOfAccount,
  hashLoginToken,
  loginLinkExpiresOn,
  loginLinkOutcome,
  maskEmail,
  type LoginLinkOutcome,
} from '@/domain/accounts/login-link';
import {
  accountConfirmationUpdateSchema,
  accountEmailSchema,
  accountRoleSchema,
  accountRowSchema,
  loginTokenRowSchema,
  loginTokenUsedUpdateSchema,
} from '@/domain/rows/account';
import type { Customer } from '@/data/schemas';
import { ADMIN_ACTOR, ANONYMOUS_ACTOR, type Actor } from './actor';
import { withAudit, type TransactionClient } from './audit';
import type { AccountView } from './account-schemas';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

/** The back office account's e-mail (D93); `.example` never resolves. */
export const ADMIN_ACCOUNT_EMAIL = 'backoffice@leaseloop.example';

/** How many pending links the demo outbox shows at most. */
export const OUTBOX_LIMIT = 20;

type Db = PrismaClient | TransactionClient;

function toAccountView(row: AccountRow): AccountView {
  return {
    id: row.id,
    customerId: row.customer_id,
    role: accountRoleSchema.parse(row.role),
    email: row.email,
    emailConfirmed: row.email_confirmed,
    confirmedOn: row.confirmed_on,
  };
}

/** The actor an account row signs in as. */
function actorOf(row: AccountRow): Actor {
  return actorOfAccount({ role: accountRoleSchema.parse(row.role), customerId: row.customer_id });
}

/**
 * Inserts the accounts that are missing: one per customer with the customer's e-mail, and the
 * back office account. Never touches an account that is there (a confirmed e-mail stays
 * confirmed across reseeds).
 */
export async function seedAccounts(
  db: PrismaClient,
  customers: readonly Customer[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.account.findMany({ select: { customer_id: true, role: true } });
  const haveCustomer = new Set(existing.map((row) => row.customer_id));
  const haveAdmin = existing.some((row) => row.role === 'admin');
  const rows = [
    ...customers
      .filter((customer) => !haveCustomer.has(customer.id))
      .map((customer) => ({
        customer_id: customer.id,
        role: 'customer',
        email: customer.email,
        email_confirmed: false,
        confirmed_on: null,
      })),
    ...(haveAdmin
      ? []
      : [
          {
            customer_id: null,
            role: 'admin',
            email: ADMIN_ACCOUNT_EMAIL,
            email_confirmed: false,
            confirmed_on: null,
          },
        ]),
  ].map((row) => parseRow('account', accountRowSchema, row));
  if (rows.length > 0) await db.account.createMany({ data: rows });
  return { created: rows.length, skipped: customers.length + 1 - rows.length };
}

/** The account that signs in as `actor`, or null (anonymous, or an actor with no account). */
export async function accountOfActor(db: Db, actor: Actor): Promise<AccountView | null> {
  if (actor === ANONYMOUS_ACTOR || actor === '') return null;
  const row =
    actor === ADMIN_ACTOR
      ? await db.account.findFirst({ where: { role: 'admin' } })
      : await db.account.findUnique({ where: { customer_id: actor } });
  return row ? toAccountView(row) : null;
}

export type LoginLinkRequested = {
  /** Null when no account has that e-mail: the caller answers the same either way. */
  link: { token: string; expiresOn: string; accountId: string } | null;
};

/**
 * A sign-in link for the account with `email`, if there is one: the token goes to the caller
 * once (the demo outbox or, in production, the mailer), only its hash is stored, plus the
 * token in clear while `demoTools` is on (D94). An unknown e-mail makes no row and no audit
 * entry, and the caller's answer does not differ.
 */
export async function requestLoginLink(
  db: PrismaClient,
  input: { email: string; today: string; demoTools: boolean }
): Promise<LoginLinkRequested> {
  const email = accountEmailSchema.parse(input.email);
  const account = await db.account.findUnique({ where: { email } });
  if (!account) return { link: null };
  const token = randomBytes(24).toString('base64url');
  const expiresOn = loginLinkExpiresOn(input.today);
  const data = parseRow('login_token', loginTokenRowSchema, {
    account_id: account.id,
    token_hash: hashLoginToken(token),
    demo_token: input.demoTools ? token : null,
    sent_on: input.today,
    expires_on: expiresOn,
    used_on: null,
  });
  await withAudit(
    db,
    {
      actor: ANONYMOUS_ACTOR,
      action: 'account.login_link_sent',
      entityType: 'account',
      entityId: account.id,
      details: { email, expiresOn, demoOutbox: input.demoTools },
    },
    (tx) => tx.loginToken.create({ data })
  );
  return { link: { token, expiresOn, accountId: account.id } };
}

export type LoginLinkState = {
  outcome: LoginLinkOutcome;
  emailMasked: string;
  sentOn: string;
  expiresOn: string;
};

type TokenWithAccount = LoginTokenRow & { account: AccountRow };

async function rowOfToken(db: Db, token: string): Promise<TokenWithAccount | null> {
  return db.loginToken.findUnique({
    where: { token_hash: hashLoginToken(token) },
    include: { account: true },
  });
}

const daysOf = (row: LoginTokenRow) => ({
  sentOn: row.sent_on,
  expiresOn: row.expires_on,
  usedOn: row.used_on,
});

/** The link's state on `today`, for the link page; null when no link has that token. */
export async function loginLinkState(
  db: Db,
  token: string,
  today: string
): Promise<LoginLinkState | null> {
  const row = await rowOfToken(db, token);
  if (!row) return null;
  return {
    outcome: loginLinkOutcome(daysOf(row), today),
    emailMasked: maskEmail(row.account.email),
    sentOn: row.sent_on,
    expiresOn: row.expires_on,
  };
}

export type SignInResult =
  | { ok: true; actor: Actor; confirmedNow: boolean }
  | { ok: false; reason: 'not_found' | 'used' | 'expired' };

/**
 * Opens the link: marks it used, confirms the account's e-mail if it was not, and names the
 * actor to sign in as. One transaction and one audit row, actor the account's own actor. A
 * link found used or expired changes nothing.
 */
export async function consumeLoginLink(
  db: PrismaClient,
  input: { token: string; today: string }
): Promise<SignInResult> {
  const found = await rowOfToken(db, input.token);
  if (!found) return { ok: false, reason: 'not_found' };
  const before = loginLinkOutcome(daysOf(found), input.today);
  if (before !== 'valid') return { ok: false, reason: before };
  const actor = actorOf(found.account);
  const confirmedNow = !found.account.email_confirmed;
  await withAudit(
    db,
    {
      actor,
      action: 'account.signed_in',
      entityType: 'account',
      entityId: found.account.id,
      details: { via: 'login_link', emailConfirmedNow: confirmedNow },
    },
    async (tx) => {
      // Read again inside the transaction: SQLite serialises writers, so two opens of the same
      // link cannot both find it unused.
      const row = await tx.loginToken.findUnique({ where: { id: found.id } });
      if (!row || loginLinkOutcome(daysOf(row), input.today) !== 'valid') {
        throw new LinkRaceError();
      }
      await tx.loginToken.update({
        where: { id: row.id },
        data: parseRow('login_token', loginTokenUsedUpdateSchema, { used_on: input.today }),
      });
      if (confirmedNow) {
        await tx.account.update({
          where: { id: found.account.id },
          data: parseRow('account', accountConfirmationUpdateSchema, {
            email_confirmed: true,
            confirmed_on: input.today,
          }),
        });
      }
    }
  ).catch((error: unknown) => {
    if (error instanceof LinkRaceError) return 'used';
    throw error;
  });
  return { ok: true, actor, confirmedNow };
}

/** Two opens of one link in the same instant: the second finds it used inside its transaction. */
class LinkRaceError extends Error {
  constructor() {
    super('the sign-in link was used by another request');
    this.name = 'LinkRaceError';
  }
}

export type OutboxLink = {
  token: string;
  email: string;
  /** The customer's name, or null for the back office account. */
  customerName: string | null;
  customerId: string | null;
  sentOn: string;
  expiresOn: string;
};

/**
 * The demo outbox (D94): every link that is still valid today and was made while the demo
 * tools were on, newest first, at most `OUTBOX_LIMIT`. Links made with the tools off have no
 * token in clear and never appear. Anyone may read it; it is a demo tool (the caller gates it).
 */
export async function listDemoOutbox(db: Db, today: string): Promise<OutboxLink[]> {
  const rows = await db.loginToken.findMany({
    where: {
      demo_token: { not: null },
      used_on: null,
      sent_on: { lte: today },
      expires_on: { gt: today },
    },
    orderBy: [{ sent_on: 'desc' }, { id: 'desc' }],
    take: OUTBOX_LIMIT,
    include: { account: { include: { customer: { select: { name: true } } } } },
  });
  return rows.map((row) => ({
    token: row.demo_token as string,
    email: row.account.email,
    customerName: row.account.customer?.name ?? null,
    customerId: row.account.customer_id,
    sentOn: row.sent_on,
    expiresOn: row.expires_on,
  }));
}
