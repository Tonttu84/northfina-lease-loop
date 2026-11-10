# Security overview

Lease Loop is a leasing demo on Next.js with one SQLite file: customers lease items and a back office reviews the cases. This page lists every security feature on `main`; the full rules are under [`docs/features/`](features/README.md).

Each section says what it stops, where it lives, which test pins it, what it does not cover, and how to show it in under a minute. The commands are for Git Bash against `npm run dev` on port 3000: in Windows PowerShell `curl` means `Invoke-WebRequest`, so use Git Bash or `curl.exe`.

**Threat model.** The app is built for a public URL. A visitor could forge a session, act as another customer or the back office, read the public audit log, or flood the API. A hostile site could make a signed-in visitor's browser write here (cross-site request forgery, CSRF), or a script could be slipped into a page (cross-site scripting, XSS). Someone with a database copy or SQL access could reuse sign-in or signing links, or quietly edit the audit log.

**What is demo-grade.** While the demo tools are on, the "Continue as" picker gives any visitor any identity, the admin included, and the demo outbox shows every sign-in link. That is on purpose, for walking the scenario cards, the demo's worked examples. One setting, `DEMO_TOOLS`, turns it all off. Left empty, it is off in a production build; an older `.env` can still turn it on (see [Demo mode as one switch](#demo-mode-as-one-switch)).

## Contents

| Feature                                                                             | Threat it answers                                        | Open this file               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| [Signed session cookie](#signed-session-cookie)                                     | Session forgery                                          | `src/server/session.ts`      |
| [Cookie flags](#cookie-flags)                                                       | Cookie theft by script or over plain HTTP                | `src/server/cookie-flags.ts` |
| [Sign-in by e-mail link](#sign-in-by-e-mail-link)                                   | Token theft from a database copy, account enumeration    | `src/server/accounts.ts`     |
| [Cross-site writes and CSRF](#cross-site-writes-and-csrf)                           | CSRF and login CSRF                                      | `src/proxy.ts`               |
| [Authorization policy](#authorization-policy)                                       | Broken access control                                    | `src/domain/authz/policy.ts` |
| [Company signing link](#company-signing-link)                                       | Signing without the right, link reuse                    | `src/server/signatories.ts`  |
| [Security headers](#security-headers)                                               | Clickjacking, injected scripts, type sniffing, URL leaks | `next.config.ts`             |
| [Tamper-evident audit log](#tamper-evident-audit-log)                               | Audit tampering                                          | `src/server/audit.ts`        |
| [Public audit log redaction](#public-audit-log-redaction)                           | Personal data leakage                                    | `src/domain/audit/redact.ts` |
| [Rate limit and body cap](#rate-limit-and-body-cap)                                 | Flooding, oversized bodies                               | `src/server/rate-limit.ts`   |
| [Input validation and the error envelope](#input-validation-and-the-error-envelope) | Bad input, mass assignment, error leaks                  | `src/server/api-response.ts` |
| [No raw SQL, no `dangerouslySetInnerHTML`](#no-raw-sql-no-dangerouslysetinnerhtml)  | SQL injection, XSS                                       | `tests/meta-rules.test.ts`   |
| [Secrets](#secrets)                                                                 | Secret leakage                                           | `scripts/ensure-env.mjs`     |
| [Demo mode as one switch](#demo-mode-as-one-switch)                                 | Demo shortcuts left on in production                     | `src/server/demo-tools.ts`   |
| [Supply chain](#supply-chain)                                                       | A bad dependency, a leaky build                          | `.github/workflows/ci.yml`   |

## Signed session cookie

**Threat.** A visitor edits the cookie to claim the admin's or another customer's identity (session forgery).

**What we do.** The `lease-loop-actor` cookie holds `base64url(actor).expires.signature`. The signature is an HMAC-SHA256 (a keyed hash only the secret's holder can make) under `SESSION_SECRET`. `verifySession` checks the shape, then the 30-day expiry, then the signature with `timingSafeEqual`. A failure reads as `anonymous`, as does every cookie while the secret is missing or under 32 characters. The generated secret is 32 random bytes, written as 43 base64url characters.

**Where.** `src/server/session.ts`, `src/server/actor.ts`; [`docs/features/security.md`](features/security.md).

**Proof.** `src/server/session.test.ts`: "refuses a value whose actor or expiry was edited after signing".

**Limits.** One session cannot be revoked before its 30 days; changing the secret signs everyone out. The actor is signed, not encrypted.

**Show it.** Pick a customer in the header, then in devtools (Application > Cookies) change one character in the first part of `lease-loop-actor`. Reload: the header shows "Sign in" again.

## Cookie flags

**Threat.** A script in the page reads the session cookie, or the cookie travels unencrypted (cookie theft).

**What we do.** Both cookies, the session's and the demo clock's `lease-loop-as-of`, are `HttpOnly; SameSite=Lax; Path=/`. A production build adds `Secure`, so they travel over HTTPS only. Sign-out sends `Max-Age=0`.

**Where.** `src/server/cookie-flags.ts`, `src/server/actor.ts`, `src/server/demo-clock.ts`.

**Proof.** `src/server/actor.test.ts`: "both headers add Secure, so the cookie travels over https only".

**Limits.** `HttpOnly` stops a script reading the cookie, not using the session from inside the page. `Secure` follows `NODE_ENV`, not the scheme, so a production build served over plain HTTP on a network address cannot keep anyone signed in. There is no `__Host-` prefix.

**Show it.** In devtools, Application > Cookies shows the HttpOnly and SameSite columns. In the console, `document.cookie` does not list `lease-loop-actor`.

## Sign-in by e-mail link

**Threat.** A database copy yields working sign-in links, a link works twice, or the answer reveals which e-mails have accounts (token theft, account enumeration).

**What we do.** `POST /api/login` makes a token of 24 random bytes and stores only its SHA-256. A link works once, on the day it is sent and the next. Opening it marks it used with a conditional `updateMany`, the transaction's first write. So of two opens at once, one signs in and the other gets 409 `LOGIN_LINK_USED`. Every valid request answers 202 Accepted, whether or not the e-mail has an account. The link page signs in only on a button click, so a mail scanner that fetches the link uses nothing up.

**Where.** `src/server/accounts.ts`, `src/app/api/login/route.ts`, `src/app/[locale]/login/[token]/login-link-form.tsx`; [`docs/features/accounts.md`](features/accounts.md).

**Proof.** `src/server/accounts.test.ts`: "two opens of one link at once: exactly one signs in, one audit row, the other is used". The click-only rule has no automated test.

**Limits.** While the demo tools are on, the token is also kept in clear for the outbox, and an unknown e-mail gets `demoLink: null`. An unknown e-mail also answers faster: a timing side channel. Links live in days, not minutes, with no cap per account. The link page lacks the signing page's `no-referrer` rule.

**Show it.** On `/en/login`, ask for a link for `aino.virtanen@example.com`, open it from the outbox on `/en/demo` and click Sign in. Open the same link again: it says the link was used.

## Cross-site writes and CSRF

**Threat.** A page on another site makes a signed-in visitor's browser write here, or signs the visitor in as the attacker with the attacker's link (CSRF, login CSRF).

**What we do.** The session cookie is `SameSite=Lax`, so the browser leaves it off a POST, PATCH or DELETE that another site starts. The proxy also refuses any write on `/api` whose `Sec-Fetch-Site` header says `cross-site`, with 403 `CROSS_SITE`. That closes `POST /api/login/[token]` too: it has no body and sets the cookie, so a plain form on another site could otherwise post it.

**Where.** `src/proxy.ts` (`isCrossSite`), `src/server/actor.ts`; [`docs/features/security.md`](features/security.md).

**Proof.** `src/proxy.test.ts`: "refuses a write a browser sends from another site with 403 CROSS_SITE, before the limit counts it".

**Limits.** There is no CSRF token. A request without `Sec-Fetch-Site`, such as curl, passes the check but carries no visitor's cookie. Another site can send a plain-text POST without asking this server first, and the server parses any body as JSON. So SameSite and `Sec-Fetch-Site` are what stop it. Both work per site, not per origin: a page on a sibling subdomain sends the cookie and is not refused. Deploy on a domain with no untrusted subdomains, or refuse `same-site` too.

**Show it.** This sign-out, marked cross-site, answers 403 `CROSS_SITE`. Without the header it answers 200 OK: curl sends no cookie, so there is no session to ride on.

```bash
curl -i -X DELETE http://localhost:3000/api/actor -H 'Sec-Fetch-Site: cross-site'
```

## Authorization policy

**Threat.** A customer reads or changes another customer's records, or does the back office's work (insecure direct object reference, IDOR, and privilege escalation).

**What we do.** One pure function, `can(actor, action, subject)`, decides every write on a customer's records or the back office's work, and every private read. The public routes (catalogue, quotes, sign-in, signing link, audit log, demo tools) are listed with their reason in `tests/meta-rules.test.ts`. The policy has five refusal codes, from `not_signed_in` to `customer_signs`. Routes call `authorize()` before they act, and the services call it again. A visitor not signed in gets 401, any other refusal 403, both `FORBIDDEN` with the reason. Another customer's application answers the same 404 `APPLICATION_NOT_FOUND` as an unknown id.

**Where.** `src/domain/authz/policy.ts`, `src/server/authorize.ts`, `tests/meta-rules.test.ts`; [`docs/features/authorization.md`](features/authorization.md).

**Proof.** `src/app/api/authz.routes.test.ts`: "the wrong customer is 403 FORBIDDEN and writes nothing"; `tests/meta-rules.test.ts`: "every API route not on the public allowlist calls authorize".

**Limits.** The meta test looks for the text `authorize(` in each route file; it proves no call path and skips pages. `POST /api/contracts` and `POST /api/applications` validate the body before they authorize, because the record they act on is named in it. `can()` lets anyone run a demo card; that route answers 404 `NOT_FOUND` while the demo tools are off.

**Show it.** Pick Aino in the header and run this in the devtools console: it answers 403 `FORBIDDEN` with `admin_only` in its details. Signed out, the same call answers 401 `FORBIDDEN` with `not_signed_in`.

```js
await (
  await fetch('/api/assets/ebike-003/status', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{"status":"reserved"}',
  })
).json();
```

## Company signing link

**Threat.** A company coordinator without signing rights approves their own case, or someone guesses, reuses or leaks a signing link (privilege escalation, token reuse).

**What we do.** A company case that needs its signatory gets a `SignatureRequest` for the named e-mail, with a token of 24 random bytes valid 14 days. Only that link signs or declines; the coordinator and the admin get `signatory_required`. A conditional `updateMany` marks the use, so a second use, even at the same instant, gets 409 `SIGNING_LINK_USED`; an expired link gets 410 `SIGNING_LINK_EXPIRED`. The API answer leaves the token out, and the signing page sends `Referrer-Policy: no-referrer`.

**Where.** `src/server/signatories.ts`, `src/app/api/sign/[token]/route.ts`, `next.config.ts` (`SIGN_PAGE_HEADERS`); [`docs/features/signatories.md`](features/signatories.md).

**Proof.** `src/server/applications.test.ts`: "two uses at the same instant: exactly one wins".

**Limits.** The signing token is stored in clear, unlike the sign-in token, so a database copy yields working links. No e-mail is sent, and there is no strong identification such as Suomi.fi, Finland's public e-identification service.

**Show it.** On `/en/demo`, run card 6 (a company case waiting for its signatory) and click "Open the page to compare". Pick Admin in the header and open the signing link from the page's outbox: the Network tab shows `Referrer-Policy: no-referrer` on its response.

## Security headers

**Threat.** Another site frames the app, an injected script loads outside code, a browser guesses a file's type, or a URL leaks (clickjacking, XSS, MIME sniffing, referrer leaks).

**What we do.** Every response carries a Content Security Policy (CSP) that allows this origin only (`default-src 'self'`) and forbids framing (`frame-ancestors 'none'`). Scripts and styles also allow `'unsafe-inline'` (Next's inline bootstrap, in every build); development adds `'unsafe-eval'` and `data:`/`blob:` images. Responses also carry `nosniff`, `X-Frame-Options: DENY`, a `strict-origin-when-cross-origin` referrer policy, and a `Permissions-Policy` that turns off camera, microphone, geolocation and payment. A production build adds HTTP Strict Transport Security (HSTS): HTTPS only, for a year.

**Where.** `next.config.ts`; [`docs/features/security.md`](features/security.md).

**Proof.** `tests/security-headers.test.ts`: "a production build allows no eval and no data or blob images, and sends HSTS".

**Limits.** Inline scripts are allowed and there are no nonces, so the policy does not stop an injected inline script. HSTS has no `preload`. The test reads the config, not a live response.

**Show it.** `curl -sI http://localhost:3000/en` lists the headers. Under `npm run dev` that is the development policy, without HSTS; `npm run build && npm start` shows the production one.

## Tamper-evident audit log

**Threat.** Someone with SQL access edits, deletes or reorders audit rows, or rewrites the whole log with fresh hashes (audit tampering).

**What we do.** Every change writes its audit row in the same transaction (`withAudit`). Each row stores the previous row's hash and its own SHA-256 over that plus its content. Both hashes are unique, so the chain cannot fork. Row hashes and the head are signed with Ed25519 (a public-key signature scheme) under a key kept outside the database. After each commit the head is appended to an anchor file. `npm run audit:anchor`, run by hand, gets an RFC 3161 receipt: a timestamp authority's signed statement that it saw that head at that time. A pure verifier names the first broken row on `/en/audit`.

**Where.** `src/server/audit.ts`, `src/domain/audit/seal.ts`, `src/server/audit-anchors.ts`, `scripts/anchor-audit-tsa.mjs`; [`docs/features/audit-chain.md`](features/audit-chain.md).

**Proof.** `src/domain/audit/seal.test.ts`: "catches a rewrite of both tables with fresh hashes: signature_mismatch at the first new hash".

**Limits.** Tamper-evident, not tamper-proof. By default the key, anchors and receipts sit on the database's disk; against someone with the disk, only a receipt copied elsewhere counts. A receipt covers the head when it was taken; later rows rest on the key and the anchor file. The verifier derives the public key from the private key, so a key swap plus a rewrite reads as intact. There is no key rotation.

**Show it.** After a few actions, `/en/audit` says "Chain intact". Run `npm run demo:tamper` and reload: it says "Chain broken at entry #n" (`npm run db:reset` cleans up).

## Public audit log redaction

**Threat.** Anyone reading the public audit log sees the birth dates, incomes and e-mails people typed in (personal data leakage).

**What we do.** The stored row keeps every detail, so the hash holds. Anyone but the admin gets a copy with personal values masked as `•••` at any depth. The masked keys are `birthDate`, `eighteenOn`, `monthlyNetIncomeCents`, `incomeCents`, `maxRentCents`, `revenueCents`, `businessId`, `country`, `email`, `signatoryEmail` and `signingLinkTo`. Any string shaped like an e-mail is masked too, and a signatory actor reads `signatory:•••`.

**Where.** `src/domain/audit/redact.ts`, `src/app/api/audit-log/route.ts`.

**Proof.** `src/app/api/audit-log/route.test.ts`: "masks the personal fields and the signatory actor for a visitor".

**Limits.** A deny-list by key name: personal data under a new key shows until the key is added. Customer ids stay visible.

**Show it.** After an application, `curl -s http://localhost:3000/api/audit-log` shows `•••` in its details. As Admin, `/en/audit` shows the stored values.

## Rate limit and body cap

**Threat.** A script floods the API with writes, each one a signed audit row, or sends a huge body (resource exhaustion).

**What we do.** The proxy counts writes on `/api` per client in a fixed 60-second window, and after 120 answers 429 `RATE_LIMITED` with `Retry-After`. The client is the first `X-Forwarded-For` address; the map holds at most 10,000 clients. A body over 64 KiB (65,536 bytes) gets 413 `PAYLOAD_TOO_LARGE`, checked before reading when declared and after reading when chunked.

**Where.** `src/proxy.ts`, `src/server/rate-limit.ts`, `src/server/api-response.ts`.

**Proof.** `src/proxy.test.ts`: "refuses the write over the limit with 429, Retry-After and the API envelope"; `src/server/api-response.test.ts`: "refuses a body over the cap with 413 before it is read".

**Limits.** Next keeps a client-sent `X-Forwarded-For`, so a client that sends one picks its own bucket: a nuisance bar, not a guarantee. Reads are not limited, and the count lives in one process's memory.

**Show it.** After a minute with no writes, 121 sign-outs give about 120 × 200 OK, then 429 `RATE_LIMITED`.

```bash
for i in $(seq 121); do curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3000/api/actor; done | sort | uniq -c
```

## Input validation and the error envelope

**Threat.** Malformed or extra input reaches the database, or an error message leaks a stack trace, SQL or personal data (mass assignment, information leakage).

**What we do.** Every JSON body is parsed with its schema in the route table (`src/server/routes.ts`), a `z.strictObject` all the way down, through `readJsonBody` (the assessment route reads its optional body itself and parses it the same way). An unknown key at any depth is 400 `VALIDATION_ERROR`, and bad JSON is 400 `INVALID_JSON`. Two meta tests hold it. The first walks each body schema's Zod definition, at any depth. It fails on an object that would let an unknown key through, an open value (`z.any`, `z.unknown`, `z.custom`, a bare transform), a `.catch()` and a loose record. The second follows every body read in a `route.ts` through the file's own import to its row's schema. It fails on a schema the route declares itself, a `request.json()` or the like, a read it cannot trace, and a row whose body no route parses. Each row is checked by its Zod write schema (`parseRow`) right before the write. Every route is wrapped in `handleRoute`: an unknown error is logged on the server, and the client gets only 500 `INTERNAL_ERROR`.

**Where.** `src/server/api-response.ts`, `src/server/row-rules.ts`, `src/server/routes.ts` and the `*-schemas.ts` files in `src/server/`, `tests/meta-rules.test.ts`.

**Proof.** `tests/meta-rules.test.ts`: "every request body in the route table refuses unknown keys, nested objects too" and "every route that reads a body parses it with the body schema of its route-table row"; `src/server/api-response.test.ts`: "turns an unknown error into a generic 500 and never leaks its message".

**Limits.** Query strings are `z.object` schemas: an unknown query parameter is dropped, not refused. A dictionary (`z.record`) passes the strict-body test when its keys must match a pattern or a format, as the application's answers do; a length limit alone does not count. The tests read definitions and source text, not requests. A `z.preprocess` fails as an open value: the walker cannot see what its function does to the keys. A body read through a renamed `readJsonBody` import, or by server code handed the request, is not seen. Some writes have no row schema yet, as [`docs/features/row-schemas.md`](features/row-schemas.md) lists. `Content-Type` is not checked.

**Show it.** A sign-in request with an extra key answers 400 `VALIDATION_ERROR` with an `unrecognized_keys` issue.

```bash
curl -s -X POST http://localhost:3000/api/login -H 'content-type: application/json' -d '{"email":"a@example.com","admin":true}'
```

## No raw SQL, no `dangerouslySetInnerHTML`

**Threat.** Text a visitor typed runs as SQL, or as a script in another visitor's page (SQL injection, stored XSS).

**What we do.** The app reaches the database through Prisma's query builder only. A meta test fails on `$queryRaw`, `$executeRaw`, any Prisma `…Unsafe` method, `Prisma.raw` or a `better-sqlite3` import in code under `src/` outside tests. The only raw SQL is the tamper demo (`scripts/tamper-audit.mjs`) and tests that play the attacker, all as parameterized tagged templates. React escapes what it renders, and nothing uses `dangerouslySetInnerHTML`.

**Where.** `src/server/` (every read and write), `tests/meta-rules.test.ts`, `scripts/tamper-audit.mjs`.

**Proof.** `tests/meta-rules.test.ts`: "no app code runs raw SQL or a Prisma …Unsafe method". `dangerouslySetInnerHTML` has no automated test; the grep below is its check.

**Limits.** The raw-SQL test reads the text line by line and cuts the comments out of each line. A `//` inside a string, such as a URL, hides the rest of its line. It does not look under `scripts/`, where the tamper demo is. Only the grep watches for `dangerouslySetInnerHTML`, and it does not cover XSS through an `href`.

**Show it.** The meta test passes, and the grep lists only test files.

```bash
npx vitest run tests/meta-rules.test.ts -t "raw SQL"
git grep -nF -e '$queryRaw' -e '$executeRaw' -e 'dangerouslySetInnerHTML' -- src
```

## Secrets

**Threat.** A signing key or session secret is committed to git or shared between machines (secret leakage).

**What we do.** `scripts/ensure-env.mjs` generates `SESSION_SECRET` and an Ed25519 `AUDIT_SIGNING_KEY` into `.env` on each machine, and never overwrites a value. `.env` is git-ignored and `.env.example` leaves both empty. Secretlint scans the staged files in the pre-commit hook and the whole tree in `npm run check:secrets`, which continuous integration (CI) runs.

**Where.** `scripts/ensure-env.mjs`, `.env.example`, `.husky/pre-commit`, `.secretlintrc.json`.

**Proof.** `scripts/ensure-env.test.mjs`: "generates 32 random bytes as base64url by default, different each time".

**Limits.** The secrets sit in `.env` beside the database: no secret store, no rotation. Secretlint knows known key shapes only.

**Show it.** `git log --all --oneline -- .env` prints nothing, and `npm run check:secrets` passes.

## Demo mode as one switch

**Threat.** Demo shortcuts stay on in production: the picker hands out the admin, the clock bends every date rule, the outbox shows sign-in links (debug features left on).

**What we do.** `demoToolsOn()` reads `DEMO_TOOLS`: `1` is on and `0` off; empty is on in development and tests, off in a production build. With the tools off, the picker, the demo clock and the card runner answer 404 `NOT_FOUND`, and the clock cookie is ignored. `POST /api/login` then returns no link and keeps no token in clear, so the outbox is empty.

**Where.** `src/server/demo-tools.ts`, `src/app/api/actor/route.ts`, `src/app/api/demo/`, `src/components/site-header.tsx`.

**Proof.** `src/app/api/actor/route.test.ts`: "answers 404 and sets no cookie: the sign-in link is the way in".

**Limits.** An `.env` made before 9 November 2026 may still say `DEMO_TOOLS="1"`, which keeps the tools on in a production build; empty it or set `0`.

**Show it.** Start with `DEMO_TOOLS=0 npm run dev`: the header has no picker, and setting the clock answers 404 `NOT_FOUND`.

```bash
curl -i -X POST http://localhost:3000/api/demo/clock -H 'content-type: application/json' -d '{"asOf":"2028-01-01"}'
```

## Supply chain

**Threat.** A dependency is compromised or vulnerable, or a build leaks a token (supply-chain attack).

**What we do.** `package-lock.json` pins every dependency, and CI installs with `npm ci`, then runs `npm audit --audit-level=high`, so a known high or critical advisory fails the build. Every action in the workflow is pinned by full commit SHA, with its release tag in a comment, so a moved tag cannot change what runs. Dependabot sends one grouped npm update and one grouped GitHub Actions update a week, and moves the SHA and the tag together. CI runs on every push and pull request with read-only permissions, no persisted credentials and a 20-minute timeout. A ruleset on `main` forbids direct and force pushes, and requires a pull request, squash merges and a green `ci` check. The review itself is a team rule ([`AGENTS.md`](../AGENTS.md), rule 13), since GitHub requires no approval.

**Where.** `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.npmrc`, the "Protect main" ruleset in the repository settings.

**Proof.** No automated test; CI is the check.

**Limits.** Moderate and low advisories pass CI: `npm ci` counts them, and the weekly Dependabot update brings a fix once a version bump allows one (on 2026-11-10, ten moderate, all one `minimatch` advisory in the lint tools, none in production). A high advisory with no ready fix blocks every pull request; the way out, in order: update it (Dependabot or `npm update`), else an `overrides` entry in `package.json` pinning the patched transitive version, else a new decision that relaxes the step (for example `--omit=dev` while the advisory is dev-only). The audit step needs the registry, so an npm outage fails CI. A pinned action is as current as Dependabot's last weekly update. The ruleset requires no approving review.

**Show it.** Open a pull request's checks on GitHub (the "Dependency audit" step), then `.github/dependabot.yml`. Locally:

```bash
npm audit --audit-level=high
```

## Known gaps and next steps

- Keys, anchors and receipts share the database's disk; move keys to a secret store, anchors off the host ([audit log](#tamper-evident-audit-log)).
- Signing tokens are stored in clear; hash them as the sign-in tokens are ([signing link](#company-signing-link)).
- The rate limit trusts a client-sent `X-Forwarded-For`; key it on the reverse proxy's header ([rate limit](#rate-limit-and-body-cap)).
- One session cannot be revoked before it expires; add a revocation list ([session](#signed-session-cookie)).
- Scripts allow `'unsafe-inline'`; move to CSP nonces ([headers](#security-headers)).
- No real e-mail and no strong identification for accounts or signatories ([sign-in](#sign-in-by-e-mail-link)).

## If they ask

**Why HMAC and not a JSON Web Token (JWT)?** The session needs one thing: an actor and an expiry the browser cannot change. One HMAC-SHA256 with a constant-time compare does that with no library and no algorithm field to get wrong; the price is that one session cannot be revoked before it expires.

**Why hash the login token?** So a database copy yields no usable sign-in links: only the SHA-256 is stored. A fast hash is enough, since a 192-bit random token leaves nothing to guess.

**What stops CSRF?** `SameSite=Lax` keeps the session cookie off a cross-site POST, and the proxy refuses any API write marked `Sec-Fetch-Site: cross-site`, sign-in links included. Both work per site, not per origin, so the app needs a domain with no untrusted subdomains.

**How would you know if someone edited the database?** Each audit row is chained to the one before by SHA-256 and signed under a key outside the database; the audit page names the first broken row. Someone who also holds the key and the anchor file is caught only by an off-machine timestamp receipt, for rows up to it.

**What would you fix first before production?** Move the keys to a secret store and the anchors off the host, hash the signing tokens, and key the rate limit on the proxy's header. Then add session revocation, CSP nonces, and real e-mail with strong identification.
