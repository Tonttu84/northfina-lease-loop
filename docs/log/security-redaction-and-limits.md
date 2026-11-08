# Time log: the public audit log masked, a rate limit and a body cap

Branch `fix/security-redaction-limits`, stacked on `fix/security-demo-mode-headers` (it extends
that branch's `docs/features/security.md`); merge that one first. The coordinating session
(Claude Fable), from the polish review of 2026-11-08 (`docs/reviews/polish-2026-11-08.md`,
security findings 3, 4 and 8, items 3 and 4 of its package).

| Time (Helsinki) | Step                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20:05           | Branch.                                                                                                                                                                                                                                                       |
| 20:06           | `src/domain/audit/redact.ts` (pure, with its test): the personal keys masked at any depth, the signatory actor masked; applied in `GET /api/audit-log` and on the audit page for anyone but the admin; a route test on a real database.                       |
| 20:06           | `src/server/rate-limit.ts` (a fixed window per client, the clock passed in) and the proxy on `/api/:path*`: writes over 120 a minute are 429 `RATE_LIMITED` with `Retry-After`; `assertBodySize` (64 kB) in `readJsonBody` and the assessment route's reader. |
| 20:10           | Tests green: redact, the audit-log route, rate-limit, proxy, api-response. `npm run check:all`; the audit page as a visitor and as admin, the root redirect and a card run in the browser.                                                                    |

**Chosen:** redaction on the way out, by key name, rather than storing less: the chain's hash and the
TSA receipts cover the stored details, and the admin's view stays complete. The rate limit lives in
the proxy, not in each route, so a new route is covered by its path.

**Left undone:** a real deployment keys the limit on the proxy's own client header, not on
`X-Forwarded-For`; the mask list is by key, so a new personal field under a new key needs a line.
