# Accounts: sign in or sign up by e-mail link, the confirmed e-mail, the demo outbox

## What it does

Every customer and the back office have an account with an e-mail; a visitor types an e-mail on the sign-in page and gets a single-use link that signs them in as that account's actor and confirms the e-mail on the account (`email_confirmed`), and an e-mail no account has signs up on the spot: a new consumer customer that holds only the e-mail, with its account (D107). No e-mail is sent: while the demo tools are on, the link is shown to the visitor and listed in the demo page's outbox for whoever opens it, which is the demo's stand-in for the inbox.

## The rule

**Accounts (D93).** One `Account` row per customer (`customer_id`, role `customer`, the customer's e-mail from the data pack) and one for the back office (`customer_id` null, role `admin`, `backoffice@leaseloop.example`), seeded unconfirmed by `prisma/seed.ts` and never overwritten (a confirmed e-mail stays confirmed across reseeds). The actor an account signs in as is D17's actor string: the customer's id, or `admin`. E-mails are stored trimmed and in lower case, the signatories' rule.

**The link (D93).** `POST /api/login` with `{ email }` makes a `LoginToken` for the account with that e-mail: 24 random bytes as base64url (32 characters), sent on the request's day, working on that day and the next (`loginLinkExpiresOn` = day + 2, exclusive), once. The route answers 202 `{ sent: true, demoLink }` whether the e-mail had an account or the request just made one (the sign-up, below), so the answer's body tells a visitor nothing about which e-mails had accounts; both paths hash a token and write an audit row, the sign-up two rows more, so a timing difference a determined caller could read remains (production would answer from a queue). Opening the link (`POST /api/login/[token]`) marks it used, sets the e-mail confirmed with the day if it was not, sets the signed session cookie (D92) for the account's actor and answers `{ actor, emailConfirmed: true, confirmedNow }`, in one transaction with one audit row (`account.signed_in`, actor the account's own). A link found used answers 409 `LOGIN_LINK_USED`, one on or after its expiry day (or before its sent day, the demo clock moved back) 410 `LOGIN_LINK_EXPIRED`, a token nobody made 404; none of those changes anything. The link page (`/[locale]/login/[token]`) shows whose link it is with the e-mail masked (`a•••@example.com`), its days and a Sign in button: the button opens the link, never the page load, so a mail scanner that fetches the page cannot use it up. The opening POST carries no body, so a browser would send it from another site without a preflight and the answer sets the session cookie; the proxy refuses every write on `/api` whose `Sec-Fetch-Site` header says `cross-site` with 403 `CROSS_SITE` ([security.md](security.md)), so a page elsewhere cannot sign a visitor in through a link its author holds.

**Sign-up (D107).** An e-mail no account has is a new customer, with the demo tools on or off: the same `POST /api/login` makes a `Customer` (id `cust-` and 16 hex digits, type `consumer`, `name` the e-mail, `is_pep` false, `story` "Signed up in the app with this e-mail on <day>.", every other column null), its unconfirmed `Account` and the first link, in one transaction with one audit row (`account.signed_up`, actor `anonymous`, details `{ email, customerId, expiresOn, demoOutbox }`). There is no separate sign-up form and no "no such account" answer: the dead end is gone. Two requests at once for one new e-mail: the unique `Account.email` refuses the second sign-up whole (its customer row rolls back with it), and that request then sends a plain link to the account the first one made. Opening the link signs in as the new customer and confirms the e-mail, exactly as for a seeded account. The record holds no name, birth date, country, employment or income until the first application answers them ([question-flow.md](question-flow.md), "A sign-up's record"): the e-mail is shown wherever a name is (the header's picker, the outbox, the leases pages), the account page says "Not on record yet: your first application adds it", and the apply page offers no "Fill in with … details" button until there are details. `Customer.country` and `Customer.city` are nullable for this; `name` is not, and holds the e-mail (`recordHoldsName` tells the placeholder from a name).

**Stored as a hash (D94).** The database holds `token_hash`, the SHA-256 of the token, and the lookup computes the same hash: a copy of the database yields no usable links. While the demo tools are on (D74), the token is also kept in clear in `demo_token`, and only then: it is what the outbox shows. With the tools off, `demo_token` is null, `POST /api/login` answers without `demoLink`, and the outbox shows nothing, so a production build has nothing to leak.

**The outbox (D94).** The demo page lists every link that is valid today and has a `demo_token`, newest first, at most 20, with the account's name and e-mail, its days and an "Open the link" button. It is open to every visitor, like the clock and the Run buttons: the demo page carries no admin gate (all visitors have the demo's implied powers; admin and customer are split only where a safety feature is being shown). The sign-in page's answer carries the same link and points at the outbox, so the demo path is: type the e-mail, click, click, signed in.

**The picker (D93).** "Continue as" stays, as a demo tool: `POST /api/actor` answers 404 while the demo tools are off and the header hides the picker, so a production build signs in by link only. `DELETE /api/actor` is the sign-out and always answers. The header shows "Sign in" to a visitor and "Account" once an actor is set, by the link or by the picker.

**The account page (D93).** `/[locale]/account`: the name (the customer's, "Back office", or "Not on record yet" for a sign-up before its first application), the e-mail, Confirmed or Not confirmed with the day, a "Send a confirmation link" button while unconfirmed (it is `POST /api/login` with the account's own e-mail), Sign out, and the way to the leases. `read_account` (D73): one's own account, the back office account for the admin, `not_signed_in` for a visitor, who is pointed at the sign-in page.

**Worked example.** On 5 November 2026 Aino types `aino.virtanen@example.com`. A link is made that works on 5 and 6 November and expires on 7 November; the audit row `account.login_link_sent` carries the e-mail (masked for anyone but the admin on the public log) and the expiry. She opens it from the outbox: `account.signed_in` as `cust-aino`, the route answers `confirmedNow: true`, her account reads `email_confirmed = true, confirmed_on = 2026-11-05`, the header shows My leases and Account. A second link opened on 6 November signs her in with `confirmedNow: false` and leaves 5 November as the confirmation day. The first link, opened again, is 409.

**Worked example, a sign-up.** On the same day a visitor types `nea.person@example.com`, which no account has. The answer is the same 202 with a link. The database now holds customer `cust-3f9a…` (consumer, name `nea.person@example.com`, nothing else), its account (unconfirmed) and the link; the audit row is `account.signed_up` by `anonymous`. The outbox lists the link under the e-mail; opening it answers `{ actor: 'cust-3f9a…', confirmedNow: true }` and the account page reads "Welcome, nea.person@example.com", Name "Not on record yet", Confirmed, 5 November 2026. She applies for `ebike-003` (card 1's e-bike, 36 months) as Nea Person, born 1990-04-12, Finland, employed, 3 200 € a month: approved, and the same transaction writes those five answers to her record. The account page now names Nea Person.

## Decisions

- D93: accounts, the sign-in link, the picker as a demo tool, `read_account`.
- D94: the token stored as a hash, kept in clear only while the demo tools are on; the outbox open to every visitor.
- D107: an e-mail with no account signs up as a blank consumer; the record's own shape; `country` and `city` nullable, `name` the e-mail.
- D92: the session the link hands out; D17: the actor string; D73, D74.

## Pure functions

`src/domain/accounts/login-link.ts`:

- `loginLinkExpiresOn(sentOn)` → the ISO day the link stops working (exclusive), `LOGIN_LINK_VALID_DAYS` = 2 after `sentOn`.
- `hashLoginToken(token)` → SHA-256 hex (`createHash`, the one `node:crypto` import a domain file may have).
- `loginLinkOutcome({ sentOn, expiresOn, usedOn }, today)` → `valid` | `used` | `expired`.
- `maskEmail(email)` → `a•••@example.com`; `•••` for a value that is not an e-mail.
- `actorOfAccount({ role, customerId })` → `admin` or the customer id; throws for a customer account without a customer.

`src/domain/rows/account.ts`: `accountRowSchema` (role ↔ customer, confirmed ↔ its day), `loginTokenRowSchema` (a 64-hex hash, a 32-to-64-character token or null, expiry after the sent day), the two update schemas.

`src/domain/customers/record.ts` (D107):

- `customerRecordSchema` → the customer as the app reads it: the data pack's three shapes, with a consumer's `birth_date`, `country` (a code or `other`), `city`, `employment` and `monthly_net_income_cents` optional. Every data-pack customer parses to itself; the pack's own `customerSchema` stays strict.
- `recordHoldsName({ name, email })` → false while the name is the e-mail (case and outer spaces ignored).
- `blankConsumerRow({ id, email, today })` → the sign-up's row: the e-mail, `is_pep` false, the story with the day, every other column null.

`src/domain/rows/customer.ts`: `customerRowSchema` (every column of `Customer`; per type the columns it must hold and the ones it never has; a consumer may lack every optional one), `customerRecordFillSchema` (the columns a first application fills: any of name, birth date, country, employment, income, at least one, never a null).

Server reads and writes (`src/server/accounts.ts`, the owner of `Account` and `LoginToken`): `seedAccounts`, `accountOfActor`, `requestLoginLink` (→ `{ link, signedUp }`; the route never passes `signedUp` on), `loginLinkState`, `consumeLoginLink`, `listDemoOutbox`. `src/server/customers.ts`, the owner of `Customer`: `newCustomerId`, `createBlankConsumer(tx, …)`, `fillCustomerRecord(tx, seen, fill)`, and `toCustomer`, which now reads the app's record shape.

## Files

- `prisma/schema.prisma` (`Account`, `LoginToken`, `Customer.account`; `Customer.country` and `Customer.city` nullable), migrations `20261109081041_accounts_login` and `20261112073057_signup_blank_customer`, `prisma/seed.ts`.
- `src/domain/customers/record.ts`, `src/domain/rows/customer.ts`, `src/server/customers.ts` (D107).
- `src/domain/accounts/login-link.ts`, `src/domain/rows/account.ts`, `src/domain/rows/audit-entry.ts` (`account`), `src/domain/authz/policy.ts` (`read_account`).
- `src/server/accounts.ts`, `account-schemas.ts`, `account-responses.ts`, `routes.ts` (the three login rows, the actor rows), `docs/openapi.json`.
- `src/app/api/login/route.ts`, `src/app/api/login/[token]/route.ts`, `src/app/api/actor/route.ts` (the demo gate).
- `src/app/[locale]/login/page.tsx`, `login-form.tsx`, `login/[token]/page.tsx`, `login-link-form.tsx`, `src/app/[locale]/account/page.tsx`, `account-actions.tsx`, `src/app/[locale]/demo/page.tsx` (the outbox), `src/components/site-header.tsx`.
- The `login.*`, `account.*`, `demo.outbox.*`, `nav.signIn` and `nav.account` keys in the four message files.
- `tests/helpers/reset-db.ts`, `tests/helpers/row-examples.ts`, `tests/schema-columns.test.ts`, `tests/meta-rules.test.ts` (the two login routes on the public allowlist).

## Tests that pin the numbers

- `src/domain/accounts/login-link.test.ts`: "is two days after the day the link is sent", "is valid on the day it is sent and the day after", "is expired on its expiry day and after", "is expired before the day it was sent", "is used once opened", the hash of `abc`, the mask, the actor.
- `src/domain/rows/account.test.ts`: the row rules; `tests/schema-columns.test.ts` holds both schemas to `schema.prisma`.
- `src/server/accounts.test.ts`: the seed (one per customer plus the back office, idempotent, a confirmed e-mail kept), the link (the token once, its hash stored, no token in clear with the tools off, the trimmed e-mail, the audit row), the sign-up ("makes a blank consumer customer, its unconfirmed account and the link, in one audited change", with the tools off too, the e-mail trimmed and in lower case, "a second request for the new one is a plain link", "two requests at once for one new e-mail: one customer, one account, two links", "reads back in the app's record shape and is a known actor", "opening the link signs in as the new customer and confirms the e-mail"), the state, opening it (signed in and confirmed with the day, admin through the back office account, the second link, single use, expired, not found), the outbox (order, the dropped links, the limit).
- `src/domain/customers/record.test.ts`: every data-pack customer reads as itself, a blank sign-up reads and the pack schema refuses it, only a consumer may lack fields, the name placeholder, the blank row. `src/domain/rows/customer.test.ts`: the row rules per type, the fill. `src/server/customers.test.ts`: `createBlankConsumer`, `fillCustomerRecord` ("writes nothing once another change filled one of the columns first"), `toCustomer` on a bad row.
- `src/app/api/login/route.test.ts`: 202 with the link for a known e-mail and, with the same keys, for a new one that signs up; the sign-up with the tools off (no link in the answer, none in clear); 400; the link read and opened (the cookie decodes to `cust-aino`), 409, 410, 404.
- `src/app/api/actor/route.test.ts`: 404 with the demo tools off.
- `src/domain/authz/policy.test.ts`: the `read_account` row.
- `e2e/09-login-outbox.spec.ts`: Aino asks for a link, opens it from the outbox, is signed in and confirmed, the link is single use, sign out forgets her; "a new e-mail signs up, signs in by its link, is confirmed, and its first application names it".

## Open questions

- **Anyone can create rows by typing e-mails.** `POST /api/login` is public and a new e-mail makes a customer, an account, a link and an audit row before anybody has proved the address is theirs; only the proxy's rate limit (120 writes a minute per client) applies. Production would hold the sign-up to its own limit per client and per address, add a challenge, and delete accounts whose first link was never opened; none of that is built.
- An account that never opens its link stays: unconfirmed, with a blank customer. Nothing expires or cleans it up.
- A sign-up is always a consumer on record. Someone who answers "sole trader" or "company" in the flow is held for a person by the record check (D38), every time; the back office has no way yet to change a record's type, so a business cannot sign up and be approved by the rules.
- Nobody can edit a record: a first answer typed wrong (a birth date, an income) sticks, and the corrected answer goes to a person. An "edit my details" page, with its own audit row, is the missing piece.
- While the demo tools are on, a sign-up is one more customer in the "Continue as" picker, under its e-mail, and its pending link is in the outbox: any visitor can read the address and act as it, as with every customer in the demo (D17, D94). With the tools off there is no picker and no outbox. A hosted demo would want the picker to list the data-pack personas only.

- Two opens of one link at the same instant: the mark is the transaction's first, conditional write, so one wins and the other answers `used` (`accounts.test.ts` "two opens of one link at once"); with one SQLite file the second waits on the first's lock, so it never errors.
- A link lives in days, on the demo clock, like the signing link: production would count minutes on the real clock and hold the e-mail to a rate limit of its own (the proxy's 120 writes a minute per client applies to `POST /api/login` today).
- No password, by choice: the link is the proof and the confirmation in one; a password would be a second secret to store and reset. A password sign-in can join the same `Account` row later.
- The back office account's e-mail is fixed in code (`ADMIN_ACCOUNT_EMAIL`); a setting in `.env` is the next step for a deployment.
- A confirmed e-mail changes nothing in the rules yet (the policy is D73's); applying or signing could require it.
- A link's request has no per-account cap: rows and their audit entries accumulate; the outbox shows the newest 20 and hides the rest. A cap, or superseding the account's older unused links, is the next step if the pitch asks for many.
- The outbox shows the newest 20 links; a demo that asks for more sees the oldest drop off the list, not expire.
