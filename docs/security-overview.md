# Security overview

Lease Loop is a leasing demo. A customer prices an item, applies, signs a lease, pays invoices and returns the item for a second life; a back office reviews cases. It runs on Next.js with one SQLite file. This page lists every security feature on `main`: what it stops, where it lives, which test pins it, and how to show it in under a minute. Each feature's full rule is on its feature page under `docs/features/`.

**Threat model.** The app is built to sit on a public URL. An anonymous visitor could try to act as another customer or as the back office, forge a session, make a signed-in visitor's browser write here, read other people's data in the public audit log, or flood the API. Someone with a copy of the database or SQL access could try to reuse sign-in or signing links, or quietly edit the audit log. The worst outcome is a lease signed or a case decided by someone without the right, with an audit log that hides it.

**What is demo-grade.** While the demo tools are on, the "Continue as" picker gives any visitor any identity, the admin included, and the demo outbox shows every sign-in link. That is on purpose, so judges can walk the scenario cards. One setting, `DEMO_TOOLS`, turns all of it off; a production build has it off by default, and the protections below are then the only way in.

## Contents

| Feature                                                                             | Threat it answers                                     | Open this file               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| [Signed session cookie](#signed-session-cookie-d92)                                 | Session forgery                                       | `src/server/session.ts`      |
| [Cookie flags](#cookie-flags)                                                       | Cookie theft by script or over plain http             | `src/server/actor.ts`        |
| [Sign-in by e-mail link](#sign-in-by-e-mail-link-d93-d94)                           | Token theft from a database copy, account enumeration | `src/server/accounts.ts`     |
| [Cross-site writes and CSRF](#cross-site-writes-and-csrf)                           | CSRF and login CSRF                                   | `src/proxy.ts`               |
| [Authorization policy](#authorization-policy-d73-d74)                               | Broken access control                                 | `src/domain/authz/policy.ts` |
| [Company signing link](#company-signing-link-d46)                                   | A coordinator signing without the right, link reuse   | `src/server/signatories.ts`  |
| [Security headers](#security-headers)                                               | Clickjacking, XSS impact, MIME sniffing, URL leaks    | `next.config.ts`             |
| [Tamper-evident audit log](#tamper-evident-audit-log-d36-d81)                       | Audit tampering                                       | `src/server/audit.ts`        |
| [Public audit log redaction](#public-audit-log-redaction)                           | Personal data leakage                                 | `src/domain/audit/redact.ts` |
| [Rate limit and body cap](#rate-limit-and-body-cap)                                 | Abuse, flooding, oversized bodies                     | `src/server/rate-limit.ts`   |
| [Input validation and the error envelope](#input-validation-and-the-error-envelope) | Bad input, mass assignment, error leaks               | `src/server/api-response.ts` |
| [No raw SQL, no `dangerouslySetInnerHTML`](#no-raw-sql-no-dangerouslysetinnerhtml)  | SQL injection, XSS                                    | `src/server/` (Prisma only)  |
| [Secrets](#secrets)                                                                 | Secret leakage                                        | `scripts/ensure-env.mjs`     |
| [Demo mode as one switch](#demo-mode-as-one-switch-d74)                             | Demo shortcuts left on in production                  | `src/server/demo-tools.ts`   |
| [Supply chain](#supply-chain)                                                       | A bad dependency, a leaky CI                          | `.github/workflows/ci.yml`   |

## Signed session cookie (D92)

**Threat** A visitor edits the cookie to say `admin` or another customer's id (session forgery).

**What we do** The `lease-loop-actor` cookie holds `base64url(actor).expires.signature`. The signature is HMAC-SHA256 over the first two parts under `SESSION_SECRET`, a 32-byte random secret; a secret under 32 characters counts as none. `verifySession` checks the shape, then the expiry (30 days, the cookie's `Max-Age`), then compares the signature with `timingSafeEqual`. Anything that fails, a missing secret included, reads as `anonymous`, and a valid actor must still be a customer in the database or `admin`.

**Where** `src/server/session.ts`, `src/server/actor.ts`.

**Proof** `src/server/session.test.ts`: "refuses a value whose actor or expiry was edited after signing", "refuses a value signed with another secret", "refuses a session that has expired, on the second itself too", "refuses a plain actor id, the old unsigned cookie", "refuses another spelling of the same signature bytes (the last character's low bits)". `src/server/actor.test.ts`, "resolveActor".

**Limits** One session cannot be ended before its 30 days; changing the secret signs everyone out. The actor is signed, not encrypted: it is a demo id. The expiry is real time, not the demo clock.

**Show it** Pick a customer in the header. In devtools, Application > Cookies, `lease-loop-actor` has three dot-separated parts. Change one character of the first part and reload: the header shows "Sign in" again.

## Cookie flags

**Threat** A script reads the session cookie (the payoff of XSS), or the cookie travels over plain http.

**What we do** Both cookies, `lease-loop-actor` and the demo clock's `lease-loop-as-of`, are `HttpOnly; SameSite=Lax; Path=/`. A production build adds `Secure` (`secureFlag`), so the browser sends them over https only. The actor cookie lives 30 days; sign-out sends `Max-Age=0`.

**Where** `src/server/cookie-flags.ts`, `src/server/actor.ts`, `src/server/demo-clock.ts`.

**Proof** `src/server/cookie-flags.test.ts`: "marks the cookie Secure on a production build". `src/server/actor.test.ts`: "sets the actor cookie for the whole site, http only, for 30 days, as a signed session", "both headers add Secure, so the cookie travels over https only". `src/server/demo-clock.test.ts`: "is Secure on a production build".

**Limits** `Secure` follows `NODE_ENV`, not the real scheme: a production build served over plain http on a LAN address gets no cookie back. No `__Host-` prefix.

**Show it** In devtools, Application > Cookies, the HttpOnly and SameSite columns. In the console, `document.cookie` does not list `lease-loop-actor`.

## Sign-in by e-mail link (D93, D94)

**Threat** A copy of the database yields usable sign-in links (token theft); a link works twice; the answer tells an attacker which e-mails have accounts (account enumeration); a mail scanner uses up the link.

**What we do** `POST /api/login` makes a token of 24 random bytes (`randomBytes`, 32 base64url characters) and stores only its SHA-256 in `token_hash`; the lookup hashes what it is given. The link works on the day it is sent and the next, once: opening it marks it used with a conditional `updateMany` (`used_on: null`) as the transaction's first write, so of two opens at once one signs in and the other gets 409 `LOGIN_LINK_USED`. The answer is 202 `{ sent: true, demoLink }` whether or not the e-mail has an account. The link page signs in only when the visitor clicks the button, never on page load.

**Where** `src/server/accounts.ts`, `src/domain/accounts/login-link.ts`, `src/app/api/login/route.ts`, `src/app/api/login/[token]/route.ts`, `src/app/[locale]/login/[token]/login-link-form.tsx`.

**Proof** `src/server/accounts.test.ts`: "makes a link for the account with that e-mail: the token once, its hash stored, two days", "keeps no token in clear while the demo tools are off (D94)", "two opens of one link at once: exactly one signs in, one audit row, the other is used", "makes no row and no audit entry for an e-mail no account has". `src/app/api/login/route.test.ts`: "answers the same 202, without a link, for an e-mail no account has", "answers 409 LOGIN_LINK_USED the second time, with no cookie". `e2e/09-login-outbox.spec.ts`. The button-not-page-load rule has no automated test of its own.

**Limits** While the demo tools are on, the token is also kept in clear (`demo_token`) for the outbox, and `demoLink: null` tells that an e-mail is unknown, by design. An unknown e-mail answers faster (no hash, no write, no audit row): a timing side channel. A link lives in days on the demo clock, not minutes. There is no cap on links per account. The link page has the site-wide `strict-origin-when-cross-origin` referrer policy, not `no-referrer` as the signing page has.

**Show it** On `/en/login`, type `aino.virtanen@example.com`. Open the link from the outbox on `/en/demo` and click Sign in. Open the same link again: it says the link was used. Then `curl -s -X POST http://localhost:3000/api/login -H 'content-type: application/json' -d '{"email":"nobody@example.com"}'` gives the same 202, with `demoLink: null`.

## Cross-site writes and CSRF

**Threat** A page on another site makes a signed-in visitor's browser write here (CSRF), or signs the visitor in as the attacker through a link the attacker holds (login CSRF).

**What we do** The session cookie is `SameSite=Lax`, so a browser does not send it with a cross-site POST, PATCH or DELETE. The proxy refuses every write on `/api` (anything but GET, HEAD, OPTIONS) whose `Sec-Fetch-Site` header is `cross-site`, with 403 `CROSS_SITE`, before the rate limit counts it. That also closes `POST /api/login/[token]`, which has no body and sets the cookie on its answer, so a plain cross-site form could otherwise post it.

**Where** `src/proxy.ts` (`isCrossSite`), `src/server/actor.ts` (the cookie).

**Proof** `src/proxy.test.ts`: "refuses a write a browser sends from another site with 403 CROSS_SITE, before the limit counts it".

**Limits** There is no CSRF token. A request without `Sec-Fetch-Site` (curl, a script, an old browser) is not refused on it; such a client has no visitor's cookie to ride on. "A JSON body needs a preflight" does not hold on its own here: `readJsonBody` does not check `Content-Type`, so a `text/plain` body that parses as JSON goes through without one. SameSite and `Sec-Fetch-Site` are what stop it.

**Show it** `curl -i -X DELETE http://localhost:3000/api/actor -H 'Sec-Fetch-Site: cross-site'` answers 403 `CROSS_SITE`. The same command without the header answers 200.

## Authorization policy (D73, D74)

**Threat** A customer reads or changes another customer's records, or does the back office's work (broken access control, IDOR, privilege escalation).

**What we do** One pure function, `can(actor, action, subject)`, decides every write and every private read. Anonymous is `not_signed_in`; a customer acts on its own records only (`not_owner`); deciding a case, assessing an asset, changing an asset's status and the second-life page are `admin_only`; a case awaiting the company's signatory is signed only through the signing link (`signatory_required`); the admin never signs a customer's lease (`customer_signs`). Routes call `authorize()`, which reads only the record's owner, before they act, and the services call it again at their top. `not_signed_in` answers 401 and any other refusal 403, both `FORBIDDEN` with the reason; another customer's application answers the same 404 as an unknown id.

**Where** `src/domain/authz/policy.ts`, `src/server/authorize.ts`, `tests/meta-rules.test.ts`.

**Proof** `src/domain/authz/policy.test.ts`: "can: every actor kind × every action". `src/app/api/authz.routes.test.ts`, for each write route: "anonymous is 401 FORBIDDEN not_signed_in and writes nothing", "the wrong customer is 403 FORBIDDEN and writes nothing". `src/server/authorize.test.ts`: "refuses anonymous before reading, so an unknown id answers the same". `tests/meta-rules.test.ts`: "every API route not on the public allowlist calls authorize".

**Limits** The meta test looks for the text `authorize(` in each route file; it does not prove every handler calls it, and it does not cover pages. Some routes read and validate the body before they authorize (`POST /api/contracts`). While the demo tools are on, the picker makes anyone the admin.

**Show it** `curl -i -X PATCH http://localhost:3000/api/assets/ebike-003/status -H 'content-type: application/json' -d '{"status":"reserved"}'` answers 401 `not_signed_in`. Pick Aino in the header and send the same request with `fetch` from the console: 403 `admin_only`.

## Company signing link (D46)

**Threat** A company coordinator without signing rights approves their own case, or someone guesses, reuses or leaks a signing link.

**What we do** When a company case needs its signatory, the server makes a `SignatureRequest` for the named e-mail with a token of 24 random bytes (192 bits, 32 base64url characters), valid 14 days. Only that link signs or declines the case; the coordinator and the admin get `signatory_required`. A use marks the request with a conditional `updateMany` inside the transaction, so a second use, even at the same instant, answers 409 `SIGNING_LINK_USED`, and an expired link 410. The token's format is checked, `GET /api/sign/[token]` leaves the token out of its answer, the decision page shows the link to the admin only, and the signing page sends `Referrer-Policy: no-referrer`.

**Where** `src/server/signatories.ts` (`createSignatureRequest`, `decideByToken`), `src/domain/signatories/mandates.ts`, `src/app/api/sign/[token]/route.ts`, `next.config.ts` (`SIGN_PAGE_HEADERS`).

**Proof** `src/server/applications.test.ts`: "the trap: a second use of the link answers already_used and writes nothing", "two uses at the same instant: exactly one wins", "an expired link and an unknown token sign nothing". `src/domain/authz/policy.test.ts`: "can: card 6, a case awaiting the company signatory (D46)". `src/domain/signatories/mandates.test.ts`. `tests/security-headers.test.ts`: "applies the build headers to every route and the referrer rule to the signing page". `e2e/04-card-6-signing-link.spec.ts`.

**Limits** The signing token is stored in clear (`SignatureRequest.token`), unlike the sign-in token, so a database copy yields usable signing links (polish review finding S10, open). No e-mail is sent; whoever holds the link acts as the signatory. There is no strong identification (Suomi.fi in production).

**Show it** On `/en/demo`, run card 6. Pick Admin and open the application: the outbox shows the signing link. Open it, look at the `Referrer-Policy: no-referrer` response header in the Network tab, and sign. Open it again: the link says it was used.

## Security headers

**Threat** Another site frames the app to trick clicks (clickjacking), an injected script loads code from elsewhere (XSS impact), a browser sniffs a file as another type, or a URL leaks through the `Referer` header.

**What we do** Every response carries a Content-Security-Policy: `default-src 'self'`, scripts and styles from this origin plus `'unsafe-inline'`, `'unsafe-eval'` and `data:`/`blob:` images in development only, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`. It also carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off camera, microphone, geolocation and payment; a production build adds `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Clickjacking is stopped twice: `frame-ancestors 'none'` and `X-Frame-Options: DENY` both forbid any site to frame the app. `poweredByHeader: false` drops `X-Powered-By`.

**Where** `next.config.ts`.

**Proof** `tests/security-headers.test.ts`: "production=%s: the policy, nosniff, no framing, a referrer policy, a permissions policy", "a production build allows no eval and no data or blob images, and sends HSTS", "applies the build headers to every route and the referrer rule to the signing page".

**Limits** `'unsafe-inline'` scripts (Next's inline bootstrap) mean the policy does not stop an injected inline script; there are no nonces. HSTS has no `preload`. The test reads the config; no test reads a live response.

**Show it** `curl -sI http://localhost:3000/en` lists the headers. In devtools, Network, click the page request and read Response Headers.

## Tamper-evident audit log (D36, D81)

**Threat** Someone with SQL access edits, deletes or reorders audit rows, or rewrites the whole log with fresh hashes (audit tampering).

**What we do** Every change writes its audit row in the same transaction (`withAudit`). Each row stores the previous row's hash and its own SHA-256 over that plus the canonical JSON of its content, time included; `prev_hash` and `hash` are unique, so the chain cannot fork. Each row hash and the head (`AuditHead`: length and hash) are signed with Ed25519 under `AUDIT_SIGNING_KEY`, which lives outside the database; `withAudit` refuses to write without it. After each commit the head is appended to an anchor file outside the database, `npm run audit:anchor` gets an RFC 3161 timestamp-authority receipt for the head, and a pure verifier names the first broken row on `/en/audit` and from `GET /api/audit-log/verify`.

**Where** `src/server/audit.ts`, `src/domain/audit/chain.ts`, `src/domain/audit/seal.ts`, `src/server/audit-signing.ts`, `src/server/audit-anchors.ts`, `scripts/tamper-audit.mjs`, `scripts/anchor-audit-tsa.mjs`.

**Proof** `src/domain/audit/chain.test.ts`: "verifies a three-row chain and names its head". `src/domain/audit/seal.test.ts`: "catches a rewrite of both tables with fresh hashes: signature_mismatch at the first new hash", "catches the same rewrite with no key at all through the anchors outside the database". `src/server/audit.test.ts`: "reports the row whose details were edited behind the app", "refuses a second row chained to the same previous row (a fork)", "refuses to write without a key, before the change runs". `tests/meta-rules.test.ts`: "no app code updates or deletes audit rows". `e2e/06-audit-page.spec.ts`.

**Limits** Tamper-evident, not tamper-proof. By default the key (`.env`), the anchor file and the receipts sit on the same disk as `dev.db`, so it stops someone with SQL access only; against someone with the disk, only a receipt copied off the machine counts. The verifier derives the public key from the private key in `.env`, so a key swap plus a rewrite reads as intact (review finding S11). There is no key rotation, and the database itself does not forbid `UPDATE` or `DELETE` on the table.

**Show it** After a few actions, open `/en/audit`: "Chain intact". Run `npm run demo:tamper` and reload: "Chain broken at entry #n". `npm run demo:tamper -- --rewrite` recomputes the hashes, and the signature still catches it. `npm run db:reset` gives a clean chain again.

## Public audit log redaction

**Threat** Anyone reading the public audit log sees the birth dates, incomes and e-mails people typed into the apply form (personal data leakage).

**What we do** The stored row keeps every detail, so the hash holds. For anyone but the admin, the audit page and `GET /api/audit-log` return a copy in which values under personal keys read `•••` at any depth: `birthDate`, `eighteenOn`, `monthlyNetIncomeCents`, `incomeCents`, `maxRentCents`, `revenueCents`, `businessId`, `country`, `email`, `signatoryEmail`, `signingLinkTo`. Any string shaped like an e-mail address is masked whatever its key, and a signatory actor reads `signatory:•••`.

**Where** `src/domain/audit/redact.ts`, `src/app/api/audit-log/route.ts`, `src/app/[locale]/audit/page.tsx`.

**Proof** `src/domain/audit/redact.test.ts`: "masks a private key at any depth, the derived ones too, and leaves the rest as it is", "masks an e-mail address under any key and keeps an id under the same key". `src/app/api/audit-log/route.test.ts`: "masks the personal fields and the signatory actor for a visitor", "shows the admin the stored row".

**Limits** A deny-list by key name: personal data under a new key shows until the key is added. Customer ids stay visible. While the demo tools are on, the admin's view is one picker click away.

**Show it** After an application, `curl -s http://localhost:3000/api/audit-log` shows `•••` in its details. Pick Admin and reload `/en/audit` to see the stored values.

## Rate limit and body cap

**Threat** A script floods the API with writes, each one a signed audit row and an anchor line, or sends a huge body (abuse, resource exhaustion).

**What we do** The proxy counts writes on `/api` per client in a fixed one-minute window: at most 120, then 429 `RATE_LIMITED` with `Retry-After`, in the API envelope. The client is the first `X-Forwarded-For` address, and the map holds at most 10 000 clients. A body is capped at 64 kB: 413 `PAYLOAD_TOO_LARGE` before it is read when `Content-Length` says so, and after reading when it is chunked.

**Where** `src/proxy.ts`, `src/server/rate-limit.ts`, `src/server/api-response.ts` (`assertBodySize`, `readBodyText`).

**Proof** `src/server/rate-limit.test.ts`: "lets `limit` requests through in a window and refuses the next with the seconds to wait", "never holds more clients than maxClients, even when no window has ended". `src/proxy.test.ts`: "refuses the write over the limit with 429, Retry-After and the API envelope". `src/server/api-response.test.ts`: "refuses a body over the cap with 413 before it is read", "a body without a declared length (chunked) is refused once read when it is over the cap".

**Limits** Next fills `X-Forwarded-For` from the socket only when the request has none, so a client that sends the header picks its own bucket: a nuisance bar, not a guarantee. Reads are not limited. The count lives in one process's memory.

**Show it** Body cap first: `head -c 70000 /dev/zero | curl -s -X POST http://localhost:3000/api/login -H 'content-type: application/json' --data-binary @-` answers 413. Then `for i in $(seq 121); do curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3000/api/actor; done | sort | uniq -c` shows the 200s, then 429.

## Input validation and the error envelope

**Threat** Malformed or extra input reaches the database (mass assignment), or an error message leaks a stack trace, SQL or personal data.

**What we do** Every JSON body is read through `readJsonBody` with a `z.strictObject` schema, so an unknown key is 400 `VALIDATION_ERROR` with the issues, and bad JSON is 400 `INVALID_JSON`. Rows are parsed by their Zod write schema (`parseRow`) right before the write; a row that breaks it is our bug and answers a generic 500. Every route is wrapped in `handleRoute`: an unknown error goes to the server log, and the client gets only `500 INTERNAL_ERROR` "Something went wrong". Today's date comes from the server (`todayForRequest`), never from the body.

**Where** `src/server/api-response.ts`, `src/server/row-rules.ts`, `src/domain/rows/`, the `*-schemas.ts` files in `src/server/`.

**Proof** `src/server/api-response.test.ts`: "turns an unknown error into a generic 500 and never leaks its message", "turns a ZodError into 400 VALIDATION_ERROR with the issues as details". `src/server/actor.test.ts`: "accepts { actor } and nothing else". `tests/meta-rules.test.ts`: "every API route handler is wrapped in handleRoute". `tests/schema-columns.test.ts`. `src/app/api/id-params.routes.test.ts`.

**Limits** Strict bodies are a convention: every body schema is strict today, but no test checks that. Some writes have no row schema yet (listed in `docs/features/row-schemas.md`). `Content-Type` is not checked.

**Show it** `curl -s -X POST http://localhost:3000/api/login -H 'content-type: application/json' -d '{"email":"a@example.com","admin":true}'` answers 400 with an `unrecognized_keys` issue.

## No raw SQL, no `dangerouslySetInnerHTML`

**Threat** SQL injection, or stored XSS through text a visitor typed.

**What we do** The app reaches the database through Prisma's query builder only: no `$queryRaw`, `$executeRaw` or their `Unsafe` forms under `src/` outside tests. The only raw SQL is the tamper demo (`scripts/tamper-audit.mjs`) and tests that play the attacker, all as parameterised tagged templates. React escapes every value it renders, and nothing in the repository uses `dangerouslySetInnerHTML`.

**Where** `src/server/` (every read and write), `scripts/tamper-audit.mjs`.

**Proof** No automated test; the grep below is the check.

**Limits** Nothing stops a future change from adding either; a meta rule would. XSS through an `href` or a third-party script is not covered by this grep (the app loads no third-party script).

**Show it** `git grep -nF -e '$queryRaw' -e '$executeRaw' -e 'dangerouslySetInnerHTML' -- src` lists only test files.

## Secrets

**Threat** A signing key or session secret is committed to git or shared between machines (secret leakage).

**What we do** `SESSION_SECRET` (32 random bytes) and `AUDIT_SIGNING_KEY` (a fresh Ed25519 key) are generated per machine into `.env` by `scripts/ensure-env.mjs`, which `db:setup`, `db:reset`, `predev` and `prestart` run. It never overwrites a value and writes nothing a process environment already provides. `.env` is git-ignored, `.env.example` has empty lines, and the tests make their own per run (`vitest.config.ts`). Secretlint (the recommended preset) scans the staged files in the pre-commit hook and the whole tree in `npm run check:secrets`, which `check:all` and CI run.

**Where** `scripts/ensure-env.mjs`, `.env.example`, `.gitignore`, `.husky/pre-commit`, `.secretlintrc.json`, `.secretlintignore`, `.github/workflows/ci.yml`.

**Proof** `scripts/ensure-env.test.mjs`: "never replaces a secret that is there", "generates 32 random bytes as base64url by default, different each time", "writes nothing when the process environment provides the variable". Secretlint itself runs as a check, not a test.

**Limits** The secrets sit in `.env` on the same disk as the database: no secret store, no rotation. Secretlint knows known key shapes only.

**Show it** `git log --all --oneline -- .env` prints nothing. `npm run check:secrets` passes.

## Demo mode as one switch (D74)

**Threat** Demo shortcuts stay on in production: the picker hands out the admin, the demo clock defeats every date rule (link expiry, quote validity, the age at signing), the outbox shows sign-in links.

**What we do** `demoToolsOn()` reads `DEMO_TOOLS`: `1` on, `0` off, empty on in development and tests and off in a production build. With the tools off, `POST /api/actor` (the picker), `POST /api/demo/clock` and `POST /api/demo/cards/[id]/run` answer 404, the clock cookie is ignored, and the header hides the picker. `POST /api/login` then returns no link and stores no token in clear, so the outbox is empty; sign-out (`DELETE /api/actor`) always works.

**Where** `src/server/demo-tools.ts`, `src/server/demo-clock.ts`, `src/app/api/actor/route.ts`, `src/app/api/demo/`, `src/app/api/login/route.ts`, `src/components/site-header.tsx`.

**Proof** `src/server/demo-tools.test.ts`. `src/app/api/actor/route.test.ts`: "answers 404 and sets no cookie: the sign-in link is the way in". `src/app/api/demo/clock/route.test.ts`: "answers 404 and sets nothing, as the card runner does". `src/server/demo-clock.test.ts`: "ignores the cookie while the demo tools are off (D74)". `src/app/api/demo/cards/[id]/run/route.test.ts`: "answers 404, sets no cookie and writes nothing". `src/app/api/login/route.test.ts`: "carries no link while the demo tools are off (D94), and stores none in clear".

**Limits** An `.env` made before 9 November 2026 may still say `DEMO_TOOLS="1"`, which keeps the tools on under `next start`. The demo page stays reachable; it says the tools are off.

**Show it** Start with `DEMO_TOOLS=0 npm run dev`. `curl -i -X POST http://localhost:3000/api/demo/clock -H 'content-type: application/json' -d '{"asOf":"2028-01-01"}'` answers 404, and the header has no picker.

## Supply chain

**Threat** A compromised or vulnerable dependency, or a CI run that leaks a token.

**What we do** `package-lock.json` pins every dependency, and CI installs with `npm ci`. Dependabot opens one grouped npm PR and one GitHub Actions PR a week. CI runs on every push and pull request with `permissions: contents: read`, `persist-credentials: false` and a 20-minute timeout: formatting, lint, typecheck, file size, no-AI, secrets, tests with coverage, the build and the browser tests. Every change reaches `main` through a reviewed pull request (`AGENTS.md`, rules 10 and 13).

**Where** `package-lock.json`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.npmrc`.

**Proof** No automated test; CI is the check.

**Limits** `.npmrc` sets `audit=false`, so Dependabot is the only alert path. Actions are pinned by major tag (`@v7`), not by commit SHA. Dependabot skips TypeScript and `@types/node` majors.

**Show it** Open a pull request's checks on GitHub, then `.github/dependabot.yml`.

## Known gaps and next steps

- No revocation of one session; changing `SESSION_SECRET` signs everyone out.
- `POST /api/login` answers an unknown e-mail faster than a known one (a timing side channel).
- No per-account cap on sign-in links; links live in days on the demo clock, not minutes.
- Signing tokens are stored in clear (review S10); hash them as the sign-in tokens are.
- The sign-in link page (`/[locale]/login/[token]`) has no `no-referrer` rule, though its token is in the path.
- The rate limiter trusts a client-sent `X-Forwarded-For`; key it on the reverse proxy's header and keep the count outside one process.
- No CSP nonces: scripts allow `'unsafe-inline'`.
- JSON bodies are parsed without a `Content-Type` check.
- The audit key, anchors and receipts share a disk with the database; the public key is not pinned (review S11); no key rotation; no database trigger against `UPDATE`/`DELETE`.
- No encryption at rest: the SQLite file and the stored audit details are plain.
- No real e-mail and no strong identification for signatories or accounts.
- The back office e-mail is fixed in code (`ADMIN_ACCOUNT_EMAIL`).
- Strict body schemas and the absence of raw SQL are conventions with no meta test.
- CI actions are pinned by tag, not SHA; `npm audit` is off.

## If they ask

**Why HMAC and not JWT?** The session needs one thing: an actor and an expiry the browser cannot change. One HMAC-SHA256 with a constant-time compare does that in a short file with no library and no algorithm field to get wrong.

**Why hash the login token?** So a copy of the database yields no usable sign-in links: the database keeps the SHA-256, and the lookup hashes what the visitor brings. A plain fast hash is enough because the token is 192 random bits, so there is nothing to guess.

**What stops CSRF?** The session cookie is `SameSite=Lax`, so the browser leaves it off a cross-site POST. On top, the proxy refuses any API write whose `Sec-Fetch-Site` says `cross-site`, which also stops login CSRF on the sign-in link, whose answer sets the cookie.

**How would you know if someone edited the database?** Every audit row is chained to the one before it by SHA-256, signed with Ed25519 under a key outside the database, and its head is copied to an anchor file; the audit page names the first broken row, and `npm run demo:tamper` shows it live. A rewrite by someone who also holds the key and the anchor file is caught only by a timestamp receipt kept off the machine.

**What would you change before production?** Move the keys to a secret store and the anchors and receipts to another host, hash the signing tokens, and key the rate limit on the reverse proxy's header. Then add session revocation, real e-mail with strong identification, CSP nonces, and a database that enforces append-only on the audit table.
