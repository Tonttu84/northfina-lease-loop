# Accounts: sign in by e-mail link, the confirmed e-mail, the demo outbox

## What it does

Every customer and the back office have an account with an e-mail; a visitor types it on the sign-in page and gets a single-use link that signs them in as that account's actor and confirms the e-mail on the account (`email_confirmed`). No e-mail is sent: while the demo tools are on, the link is shown to the visitor and listed in the demo page's outbox for whoever opens it, which is the demo's stand-in for the inbox.

## The rule

**Accounts (D93).** One `Account` row per customer (`customer_id`, role `customer`, the customer's e-mail from the data pack) and one for the back office (`customer_id` null, role `admin`, `backoffice@leaseloop.example`), seeded unconfirmed by `prisma/seed.ts` and never overwritten (a confirmed e-mail stays confirmed across reseeds). The actor an account signs in as is D17's actor string: the customer's id, or `admin`. E-mails are stored trimmed and in lower case, the signatories' rule.

**The link (D93).** `POST /api/login` with `{ email }` makes a `LoginToken` for the account with that e-mail: 24 random bytes as base64url (32 characters), sent on the request's day, working on that day and the next (`loginLinkExpiresOn` = day + 2, exclusive), once. The route answers 202 `{ sent: true, demoLink }` whether or not an account has the e-mail, so nothing tells a visitor which e-mails have accounts; an unknown e-mail writes no row and no audit entry. Opening the link (`POST /api/login/[token]`) marks it used, sets the e-mail confirmed with the day if it was not, sets the signed session cookie (D92) for the account's actor and answers `{ actor, emailConfirmed: true, confirmedNow }`, in one transaction with one audit row (`account.signed_in`, actor the account's own). A link found used answers 409 `LOGIN_LINK_USED`, one on or after its expiry day (or before its sent day, the demo clock moved back) 410 `LOGIN_LINK_EXPIRED`, a token nobody made 404; none of those changes anything. The link page (`/[locale]/login/[token]`) shows whose link it is with the e-mail masked (`a•••@example.com`), its days and a Sign in button: the button opens the link, never the page load, so a mail scanner that fetches the page cannot use it up.

**Stored as a hash (D94).** The database holds `token_hash`, the SHA-256 of the token, and the lookup computes the same hash: a copy of the database yields no usable links. While the demo tools are on (D74), the token is also kept in clear in `demo_token`, and only then: it is what the outbox shows. With the tools off, `demo_token` is null, `POST /api/login` answers without `demoLink`, and the outbox shows nothing, so a production build has nothing to leak.

**The outbox (D94).** The demo page lists every link that is valid today and has a `demo_token`, newest first, at most 20, with the account's name and e-mail, its days and an "Open the link" button. It is open to every visitor, like the clock and the Run buttons: the demo page carries no admin gate (all visitors have the demo's implied powers; admin and customer are split only where a safety feature is being shown). The sign-in page's answer carries the same link and points at the outbox, so the demo path is: type the e-mail, click, click, signed in.

**The picker (D93).** "Continue as" stays, as a demo tool: `POST /api/actor` answers 404 while the demo tools are off and the header hides the picker, so a production build signs in by link only. `DELETE /api/actor` is the sign-out and always answers. The header shows "Sign in" to a visitor and "Account" once an actor is set, by the link or by the picker.

**The account page (D93).** `/[locale]/account`: the name (the customer's, or "Back office"), the e-mail, Confirmed or Not confirmed with the day, a "Send a confirmation link" button while unconfirmed (it is `POST /api/login` with the account's own e-mail), Sign out, and the way to the leases. `read_account` (D73): one's own account, the back office account for the admin, `not_signed_in` for a visitor, who is pointed at the sign-in page.

**Worked example.** On 5 November 2026 Aino types `aino.virtanen@example.com`. A link is made that works on 5 and 6 November and expires on 7 November; the audit row `account.login_link_sent` carries the e-mail (masked for anyone but the admin on the public log) and the expiry. She opens it from the outbox: `account.signed_in` as `cust-aino` with `emailConfirmedNow: true`, her account reads `email_confirmed = true, confirmed_on = 2026-11-05`, the header shows My leases and Account. A second link opened on 6 November signs her in with `confirmedNow: false` and leaves 5 November as the confirmation day. The first link, opened again, is 409.

## Decisions

- D93: accounts, the sign-in link, the picker as a demo tool, `read_account`.
- D94: the token stored as a hash, kept in clear only while the demo tools are on; the outbox open to every visitor.
- D92: the session the link hands out; D17: the actor string; D73, D74.

## Pure functions

`src/domain/accounts/login-link.ts`:

- `loginLinkExpiresOn(sentOn)` → the ISO day the link stops working (exclusive), `LOGIN_LINK_VALID_DAYS` = 2 after `sentOn`.
- `hashLoginToken(token)` → SHA-256 hex (`createHash`, the one `node:crypto` import a domain file may have).
- `loginLinkOutcome({ sentOn, expiresOn, usedOn }, today)` → `valid` | `used` | `expired`.
- `maskEmail(email)` → `a•••@example.com`; `•••` for a value that is not an e-mail.
- `actorOfAccount({ role, customerId })` → `admin` or the customer id; throws for a customer account without a customer.

`src/domain/rows/account.ts`: `accountRowSchema` (role ↔ customer, confirmed ↔ its day), `loginTokenRowSchema` (a 64-hex hash, a 32-to-64-character token or null, expiry after the sent day), the two update schemas.

Server reads and writes (`src/server/accounts.ts`, the owner of `Account` and `LoginToken`): `seedAccounts`, `accountOfActor`, `requestLoginLink`, `loginLinkState`, `consumeLoginLink`, `listDemoOutbox`.

## Files

- `prisma/schema.prisma` (`Account`, `LoginToken`, `Customer.account`), migration `20261109081041_accounts_login`, `prisma/seed.ts`.
- `src/domain/accounts/login-link.ts`, `src/domain/rows/account.ts`, `src/domain/rows/audit-entry.ts` (`account`), `src/domain/authz/policy.ts` (`read_account`).
- `src/server/accounts.ts`, `account-schemas.ts`, `account-responses.ts`, `routes.ts` (the three login rows, the actor rows), `docs/openapi.json`.
- `src/app/api/login/route.ts`, `src/app/api/login/[token]/route.ts`, `src/app/api/actor/route.ts` (the demo gate).
- `src/app/[locale]/login/page.tsx`, `login-form.tsx`, `login/[token]/page.tsx`, `login-link-form.tsx`, `src/app/[locale]/account/page.tsx`, `account-actions.tsx`, `src/app/[locale]/demo/page.tsx` (the outbox), `src/components/site-header.tsx`.
- The `login.*`, `account.*`, `demo.outbox.*`, `nav.signIn` and `nav.account` keys in the four message files.
- `tests/helpers/reset-db.ts`, `tests/helpers/row-examples.ts`, `tests/schema-columns.test.ts`, `tests/meta-rules.test.ts` (the two login routes on the public allowlist).

## Tests that pin the numbers

- `src/domain/accounts/login-link.test.ts`: "is two days after the day the link is sent", "is valid on the day it is sent and the day after", "is expired on its expiry day and after", "is expired before the day it was sent", "is used once opened", the hash of `abc`, the mask, the actor.
- `src/domain/rows/account.test.ts`: the row rules; `tests/schema-columns.test.ts` holds both schemas to `schema.prisma`.
- `src/server/accounts.test.ts`: the seed (one per customer plus the back office, idempotent, a confirmed e-mail kept), the link (the token once, its hash stored, no token in clear with the tools off, the trimmed e-mail, nothing for a stranger, the audit row), the state, opening it (signed in and confirmed with the day, admin through the back office account, the second link, single use, expired, not found), the outbox (order, the dropped links, the limit).
- `src/app/api/login/route.test.ts`: 202 with and without the link, nothing with the tools off, 400; the link read and opened (the cookie decodes to `cust-aino`), 409, 410, 404.
- `src/app/api/actor/route.test.ts`: 404 with the demo tools off.
- `src/domain/authz/policy.test.ts`: the `read_account` row.
- `e2e/09-login-outbox.spec.ts`: Aino asks for a link, opens it from the outbox, is signed in and confirmed, the link is single use, sign out forgets her.

## Open questions

- A link lives in days, on the demo clock, like the signing link: production would count minutes on the real clock and hold the e-mail to a rate limit of its own (the proxy's 120 writes a minute per client applies to `POST /api/login` today).
- No password, by choice: the link is the proof and the confirmation in one; a password would be a second secret to store and reset. A password sign-in can join the same `Account` row later.
- The back office account's e-mail is fixed in code (`ADMIN_ACCOUNT_EMAIL`); a setting in `.env` is the next step for a deployment.
- A confirmed e-mail changes nothing in the rules yet (the policy is D73's); applying or signing could require it.
- The outbox shows the newest 20 links; a demo that asks for more sees the oldest drop off the list, not expire.
