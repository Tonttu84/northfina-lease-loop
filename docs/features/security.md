# Security: demo mode, the response headers, the public audit log, limits

## What it does

Names the demo mode and switches it as one thing, puts the usual security headers on every response, keeps a visitor's personal data out of the public audit log, and caps what one client may write. None of it is a login: D17 stands, the "continue as" picker is the demo's way in, and the policy in [authorization.md](authorization.md) decides what each actor may do.

## The rule

**Demo mode (D74).** `DEMO_TOOLS` is the one switch: left empty, the demo tools are on in development and in the tests and off in a production build (`next start`); `1` turns them on there too, `0` turns them off everywhere. The tools are the scenario-card runner (`POST /api/demo/cards/[id]/run`), the demo clock's route (`POST /api/demo/clock`) and the clock cookie itself: with the tools off both routes answer 404 and `todayForRequest()` ignores the cookie, so a quote's validity, a signing link's expiry and the age at signing run on the real day. The demo page says when the tools are off and shows neither the clock form nor the Run buttons; the audit log stays, it is not a demo tool. The actor picker is not gated: without it there is no way in (D17).

**Headers.** Every response carries `Content-Security-Policy` (scripts, styles, fonts, images and connections from this origin only; Next's inline bootstrap needs `'unsafe-inline'`, development also `'unsafe-eval'`; no framing, `base-uri` and `form-action` here, no plugins), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns the camera, microphone, geolocation and payment APIs off. A production build adds `Strict-Transport-Security`. The signing page (`/[locale]/sign/[token]`) sends no referrer at all: its token is in the URL. The policy is static because the app loads nothing from a third party (`next/font` serves the fonts from here).

**Cookies.** The actor and demo-clock cookies are `HttpOnly; SameSite=Lax` always and `Secure` on a production build (`secureFlag`), never on plain-http development.

**The public audit log** and **limits**: see the second security slice (`docs/log/security-redaction-and-limits.md`) when it lands; until then the log shows every detail and nothing is rate-limited.

**Secrets.** The pre-commit hook already scans the staged files; `npm run check:secrets` (in `check:all`, so in CI) scans the whole tree with the same rules, `.secretlintignore` leaving out dependencies, build output, generated code and the local databases.

## Decisions

- D74: `DEMO_TOOLS` now gates the clock as well as the card runner, and the default follows the build. The D74 row in `docs/decisions.md` is unchanged; this page is the record.
- D17: no login; nothing here changes who may pick admin. A door on the picker (an access code and a signed cookie) is the next step if a public URL stays up unattended, and is written up in the polish review (`docs/reviews/polish-2026-11-08.md`, security finding 1).

## Pure functions

- `demoToolsOn(env)` (`src/server/demo-tools.ts`): the switch, from the environment passed in.
- `secureFlag(env)` (`src/server/cookie-flags.ts`): `; Secure` on a production build, else nothing.
- `resolveToday(systemToday, override)` (`src/server/demo-clock.ts`): unchanged; the caller passes no override while the tools are off.

## Files

- `next.config.ts`: the headers.
- `src/server/demo-clock.ts`, `src/app/api/demo/clock/route.ts`, `src/app/[locale]/demo/page.tsx`: the clock gated.
- `src/server/cookie-flags.ts`, `src/server/actor.ts`: the cookies.
- `.env.example`, `.secretlintignore`, `package.json` (`check:secrets`).

## Tests that pin the numbers

- `tests/security-headers.test.ts`: the headers of every route, eval and HSTS by build, the signing page's referrer policy.
- `src/server/demo-clock.test.ts`, `src/app/api/demo/clock/route.test.ts`: the clock ignored and the route 404 with the tools off; the cookie Secure in production.
- `src/server/cookie-flags.test.ts`, `src/server/actor.test.ts`: the Secure flag.

## Open questions

- A nonce-based policy (no `'unsafe-inline'` for scripts) needs the proxy to mint a nonce per request and thread it into every script tag; not needed while no third-party script and no user-written HTML is rendered.
- The `Permissions-Policy` list is the common four; extend it if a browser warns about another feature the app does not use.
- A production build served over plain http on a LAN address (the `Network:` line `next start` prints) gets no actor or clock cookie back: the browser drops a `Secure` cookie there. `localhost` counts as secure, https always does; a demo shown from another machine on the LAN needs https (or a tunnel) on a production build, or `next dev`.
