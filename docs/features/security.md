# Security: demo mode, the response headers, the public audit log, limits

## What it does

Names the demo mode and switches it as one thing, puts the usual security headers on every response, keeps a visitor's personal data out of the public audit log, and caps what one client may write. None of it is a login: D17 stands, the "continue as" picker is the demo's way in, and the policy in [authorization.md](authorization.md) decides what each actor may do.

## The rule

**Demo mode (D74).** `DEMO_TOOLS` is the one switch: left empty, the demo tools are on in development and in the tests and off in a production build (`next start`); `1` turns them on there too, `0` turns them off everywhere. The tools are the scenario-card runner (`POST /api/demo/cards/[id]/run`), the demo clock's route (`POST /api/demo/clock`) and the clock cookie itself: with the tools off both routes answer 404 and `todayForRequest()` ignores the cookie, so a quote's validity, a signing link's expiry and the age at signing run on the real day. The demo page says when the tools are off and shows neither the clock form nor the Run buttons; the audit log stays, it is not a demo tool. The actor picker is not gated: without it there is no way in (D17).

**Headers.** Every response carries `Content-Security-Policy` (scripts, styles, fonts, images and connections from this origin only; Next's inline bootstrap needs `'unsafe-inline'`, development also `'unsafe-eval'`; no framing, `base-uri` and `form-action` here, no plugins), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns the camera, microphone, geolocation and payment APIs off. A production build adds `Strict-Transport-Security`. The signing page (`/[locale]/sign/[token]`) sends no referrer at all: its token is in the URL. The policy is static because the app loads nothing from a third party (`next/font` serves the fonts from here).

**Cookies.** The actor and demo-clock cookies are `HttpOnly; SameSite=Lax` always and `Secure` on a production build (`secureFlag`), never on plain-http development.

**The public audit log.** The chain stores every detail, so the hash holds and the admin reads the stored rows. Anyone else, on the audit page and from `GET /api/audit-log`, gets a copy with the personal fields masked as `•••`: the keys the apply form and the signatory list took from a person and the values derived from them (`birthDate`, `eighteenOn`, `monthlyNetIncomeCents`, `incomeCents`, `maxRentCents`, `revenueCents`, `businessId`, `country`, `email`, `signingLinkTo`), wherever they sit in the details; any string that reads as an e-mail address whatever its key (the signatory's `by`, while an actor id under the same key stays); and a signatory's e-mail in the actor column (`signatory:•••`). The ids stay: `cust-aino` names a demo customer, not a person.

**Limits.** The proxy counts the writes (anything but GET, HEAD, OPTIONS) on `/api` per client, the first address of `X-Forwarded-For`, which Next's server fills from the socket when a request carries none, so each address has its own window: at most 120 in a minute, then 429 `RATE_LIMITED` in the API envelope with `Retry-After`. Reads are not counted; one instance holds the one SQLite file, so one memory is the whole truth, and the map never holds more than 10 000 clients (the ended windows go first, then the oldest). It is a nuisance bar against a careless script, not a guarantee: a client that sets the header picks its own bucket. A body over 64 kB is refused with 413 `PAYLOAD_TOO_LARGE`: before it is read when its declared length says so, once read when it declared none (a chunked body), in `readJsonBody` and the assessment route's own reader; the route handlers themselves put no limit on a body.

**Secrets.** The pre-commit hook already scans the staged files; `npm run check:secrets` (in `check:all`, so in CI) scans the whole tree with the same rules, `.secretlintignore` leaving out dependencies, build output, generated code and the local databases.

## Decisions

- D74: `DEMO_TOOLS` now gates the clock as well as the card runner, and the default follows the build. The D74 row in `docs/decisions.md` is unchanged; this page is the record.
- D17: no login; nothing here changes who may pick admin. A door on the picker (an access code and a signed cookie) is the next step if a public URL stays up unattended, and is written up in the polish review (`docs/reviews/polish-2026-11-08.md`, security finding 1).

## Pure functions

- `demoToolsOn(env)` (`src/server/demo-tools.ts`): the switch, from the environment passed in.
- `secureFlag(env)` (`src/server/cookie-flags.ts`): `; Secure` on a production build, else nothing.
- `redactAuditDetails(details)`, `redactAuditActor(actor)`, `redactAuditEntry(entry)` (`src/domain/audit/redact.ts`): the visitor's copy of an audit row.
- `createRateLimiter(rule)` (`src/server/rate-limit.ts`): `take(key, now)` says whether one more request of `key` fits the window; the clock is an argument.
- `assertBodySize(request, maxBytes)` (`src/server/api-response.ts`): 413 over the cap.
- `resolveToday(systemToday, override)` (`src/server/demo-clock.ts`): unchanged; the caller passes no override while the tools are off.

## Files

- `next.config.ts`: the headers.
- `src/server/demo-clock.ts`, `src/app/api/demo/clock/route.ts`, `src/app/[locale]/demo/page.tsx`: the clock gated.
- `src/server/cookie-flags.ts`, `src/server/actor.ts`: the cookies.
- `.env.example`, `.secretlintignore`, `package.json` (`check:secrets`).
- `src/domain/audit/redact.ts`, `src/app/api/audit-log/route.ts`, `src/app/[locale]/audit/page.tsx`: the public log.
- `src/server/rate-limit.ts`, `src/proxy.ts` (matcher `/` and `/api/:path*`), `src/server/api-response.ts` (`assertBodySize`), `src/app/api/assets/[id]/assessments/route.ts`: the limits.

## Tests that pin the numbers

- `tests/security-headers.test.ts`: the headers of every route, eval and HSTS by build, the signing page's referrer policy.
- `src/server/demo-clock.test.ts`, `src/app/api/demo/clock/route.test.ts`: the clock ignored and the route 404 with the tools off; the cookie Secure in production.
- `src/server/cookie-flags.test.ts`, `src/server/actor.test.ts`: the Secure flag.
- `src/domain/audit/redact.test.ts`; `src/app/api/audit-log/route.test.ts` (a visitor masked, the admin not, on a real database).
- `src/server/rate-limit.test.ts` (the window, per client, the wait, the sweep); `src/proxy.test.ts` (the redirect, a read untouched, 429 with `Retry-After` and the envelope, per forwarded address); `src/server/api-response.test.ts` "assertBodySize".

## Open questions

- A nonce-based policy (no `'unsafe-inline'` for scripts) needs the proxy to mint a nonce per request and thread it into every script tag; not needed while no third-party script and no user-written HTML is rendered.
- The `Permissions-Policy` list is the common four; extend it if a browser warns about another feature the app does not use.
- The mask is by key name plus the shape of an e-mail address: a new detail that carries other personal data under a new key must be added to `PRIVATE_DETAIL_KEYS`, or better, written under one of them. A value derived from a masked one (a date or an amount computed from it) needs its own key in the list, as `eighteenOn` and `maxRentCents` do.
- The limit trusts the first `X-Forwarded-For` address, which the client can set (Next keeps a value the request brings); a real deployment keys on the reverse proxy's own header (`CF-Connecting-IP`, `X-Real-IP`) and strips the client's.
- The mask holds against casual readers and crawlers: with no login, the admin's view is one picker click away (D17); an admin access code (the review's S1) is what closes that.
- A production build served over plain http on a LAN address (the `Network:` line `next start` prints) gets no actor or clock cookie back: the browser drops a `Secure` cookie there. `localhost` counts as secure, https always does; a demo shown from another machine on the LAN needs https (or a tunnel) on a production build, or `next dev`.
