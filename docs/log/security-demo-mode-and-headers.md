# Time log: demo mode as one switch, the response headers, Secure cookies

Branch `fix/security-demo-mode-headers` from `main` f1a6f44. The coordinating session (Claude
Fable), from the polish review of 2026-11-08 (`docs/reviews/polish-2026-11-08.md`, security
findings S1, S2, S5, S6 and the secrets note and the first two items of its package). The feature page is
`docs/features/security.md`.

| Time (Helsinki) | Step                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19:50           | Branch from `main`.                                                                                                                                                                                                                                                               |
| 19:52           | `DEMO_TOOLS` gates the clock too: `readDemoClock` ignores the cookie and `POST /api/demo/clock` answers 404 with the tools off; the demo page says so and hides the clock form and the Run buttons (`demo.toolsOff.*` in four languages); `.env.example` leaves the switch empty. |
| 19:52           | `secureFlag` (`cookie-flags.ts`): the actor and clock cookies are `Secure` on a production build. `next.config.ts`: the static CSP, nosniff, `X-Frame-Options`, `Referrer-Policy` (`no-referrer` on the signing page), `Permissions-Policy`, HSTS in production.                  |
| 19:52           | `check:secrets` (secretlint over the tree, `.secretlintignore`) in `check:all`: four seconds, nothing found. Tests: `cookie-flags`, `actor`, `demo-clock`, the clock route, `tests/security-headers.test.ts`; 82 green.                                                           |
| 19:55           | In the browser (dev server): the headers on `/en`, `/api/assets` and `/en/sign/…`; `/en`, `/en/demo`, `/en/assets/ebike-003`, `/en/audit` and a card run with no policy violation in the console. `npm run check:all`, then a production `next start` under the eval-free policy. |

**Chosen:** a static policy with `'unsafe-inline'` for scripts and styles rather than a nonce per
request: the app loads nothing from a third party and renders no user-written HTML, Next's own
bootstrap is inline, and a nonce would need the proxy on every route. Development alone adds
`'unsafe-eval'` for fast refresh.

**Left undone:** the picker still hands out `admin` (D17); an access code and a signed cookie are
the next step if a public URL stays up unattended (the review's finding 1, both halves together or
neither). The sv and et texts of `demo.toolsOff.*` were written here and deserve a native read.
