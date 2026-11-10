# Security overview: time log

Branch `docs/security-overview` from `origin/main` at `f58503b`, worktree `.claude/worktrees/security-overview`. Real clock (Helsinki), 2026-11-10: every time below is from `date "+%H:%M"` or a commit stamp. One page that sums up every security feature for the author's interviews: `docs/security-overview.md`.

- 10:35 worktree created; `npm run setup` started in the background (5 min 27 s, done about 10:41).
- 10:35 to 10:41 read `AGENTS.md`; the feature pages `security.md`, `authorization.md`, `accounts.md`, `audit-chain.md`, `signatories.md`, `row-schemas.md`; D17, D46, D73, D74, D81, D92, D93, D94 in `docs/decisions.md`; section 2 of `docs/reviews/polish-2026-11-08.md` (S1 to S12). Then the code: `next.config.ts`, `src/proxy.ts`, `session.ts`, `actor.ts`, `cookie-flags.ts`, `demo-tools.ts`, `demo-clock.ts`, `accounts.ts`, `login-link.ts`, the login, actor, sign, contracts and asset-status routes, `authorize.ts`, `policy.ts`, `api-response.ts`, `rate-limit.ts`, `row-rules.ts`, `audit.ts`, `audit-signing.ts`, `audit-anchors.ts`, `redact.ts`, `signatories.ts` and its schemas, `scripts/ensure-env.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`, `.npmrc`, `.secretlintrc.json`, `.secretlintignore`, `.husky/*`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `prisma/schema.prisma` (the token, account and audit models), and the test names in every test file the page cites.
- Greps: no `$queryRaw`/`$executeRaw` under `src/` outside tests (only `scripts/tamper-audit.mjs` and the audit tests, as tagged templates); no `dangerouslySetInnerHTML` anywhere; `randomBytes` only for the two link tokens and `ensure-env.mjs`; `timingSafeEqual` only in `session.ts`; `Sec-Fetch-Site` only in `src/proxy.ts`; `Set-Cookie` only from the actor, login, clock and card-runner routes; every JSON body schema is a `z.strictObject`; no `Content-Type` check anywhere; no pseudo-languages on `main` (only `en`, `fi`, `sv`, `et`). Checked in `node_modules/next/dist/server/base-server.js` that Next fills `X-Forwarded-For` with `??=`, so a client-sent value is kept.
- 10:41 to 10:43 wrote `docs/security-overview.md` in the coordinator's skeleton (opening, contents table, fifteen feature sections with Threat, What we do, Where, Proof, Limits, Show it, the gaps, five interview questions). A script checked that every path on the page exists and every quoted test name is in a test file. Linked it from the README's Features list and from the first paragraph of `docs/features/security.md`.

- 10:43 to 10:47 `npm run check:all` green: format, lint, typecheck, file size, no-AI, secrets, 170 test files with 2 005 tests, coverage 97.7 % lines, build. Then the commit and the pull request; the review (rule 13) is the coordinator's to start.

## Discrepancies found (the page follows the code; the other pages are not changed here)

(The first two are fixed in the second session below.)

- `docs/features/security.md`, "Cross-site writes": "A JSON body already forces a preflight". `readJsonBody` never checks `Content-Type`, so a `text/plain` body that parses as JSON needs no preflight; `SameSite=Lax` and the `Sec-Fetch-Site` refusal are what stop a cross-site write.
- `docs/features/security.md`, "The public audit log": the list of masked keys leaves out `signatoryEmail`, which `PRIVATE_DETAIL_KEYS` masks.
- `docs/features/authorization.md`: the actor × action table says `ok` for the admin on `sign_contract`; the code and `policy.test.ts` say `customer_signs` (D88; the page mentions it further down). The table also lacks `withdraw_application` and `read_account`, and the rule order on the page differs from the order in `can()`.
- `docs/features/authorization.md`, "What it does": every route asks the policy "before it reads the body". `POST /api/contracts` reads and validates the body first, since it needs the application id.
- `docs/features/authorization.md`, first open question: `authorize` is still to be added to the leases page and `customers/[id]`; both pages call it on `main`.
- `docs/features/signatories.md`, open questions: "The decision page has no access check yet"; the page shows the signing link to the admin only (`src/app/[locale]/applications/[id]/page.tsx`).
- `isAuthzRefusal`'s test is named "knows the four codes and nothing else"; there are five codes since `customer_signs`.
- `.env.example` describes `DEMO_TOOLS` as the clock and the Run buttons only; since D93 and D94 it also gates the picker and the outbox.

## Not verified

- The "Show it" commands were not run against a live server in this task; they follow the code and the tests.
- The dependency advisories of the polish review (S12) were not re-checked.

## Review fixes and the shared shape (second session, same day)

Same worktree and branch, at `da4e737`. Real clock from `date "+%H:%M"`.

- 10:59 read `AGENTS.md`, the rule-13 review posted on PR 15 (verdict: approve with fixes, findings 1 to 15) and the harmonisation rules shared with the twin overview page of another project.
- 10:59 to 11:10 re-checked against the code what the rewrite touches: the `PUBLIC_ROUTES` allowlist in `tests/meta-rules.test.ts` (12 routes) and `run_demo_card` in `can()`; the CSP in `next.config.ts` (`'unsafe-inline'` in every build, `'unsafe-eval'` and `data: blob:` in development only, `font-src 'self'`); `readJsonBody` (no `Content-Type` check); `isCrossSite` (`cross-site` only); `.env.example` (`DEMO_TOOLS=""`, receipts in `audit-tsa/`); nothing runs `audit:anchor` but a person; `SESSION_SECRET_MIN_LENGTH` 32 and `randomBytes(32)` (43 characters); `parseRow` throws `RowRuleError`, which `handleRoute` turns into 500 `INTERNAL_ERROR`; another customer's application answers 404 `APPLICATION_NOT_FOUND`; the demo routes answer 404 `NOT_FOUND`; card 6's run lands on the application as the customer, with "Open the page to compare"; the "Protect main" ruleset through `gh api` (no bypass, pull request with squash only, `ci` required and up to date, resolved threads, no force push or deletion, `required_approving_review_count` 0). Rewrote `docs/security-overview.md`: every review finding and every harmonisation rule (labels with a period, no D numbers in headings, the Git Bash line, glossed acronyms, at most three tests per Proof, short Show it with fenced commands, six gap bullets, question 5 "What would you fix first before production?"). 4,486 words down to about 3,400. Fixed the two wrong lines of `docs/features/security.md` (the preflight sentence, `signatoryEmail` in the masked keys).
- 11:10 a script in the session's scratchpad (not in the repository) checked that every path and link on the page exists, every anchor matches a heading, every quoted test name is in a test file, each section has the six labels in order, Proof has at most three tests, and no gap bullet is over 20 words: no problems.
- 11:10 to 11:14 `npm run check:all` failed once: the no-AI meta test timed out at 5.4 s against its 5 s limit while the whole suite ran (it scans the tree; nothing in this change touches it). Alone it passed in 10 s.
- 11:15 to 11:17 `npm run check:all` again, green: format, lint, typecheck, file size, no-AI, secrets, 170 test files with 2,005 tests, coverage 97.73 % lines, build. Then the commit, the push and the PR body (the Follow-ups list and the **Reviewed** line); a re-review of the new head is the coordinator's to start.
- Not verified: the Show it commands were still not run against a live server, and the card 6 outbox step was read from the code, not clicked.

Left for a follow-up (listed in the PR body): `docs/features/authorization.md` (the admin's `sign_contract` cell, the missing `withdraw_application` and `read_account` rows, the rule order; "before it reads the body"; the first open question), `docs/features/signatories.md` (the decision-page open question), the `isAuthzRefusal` test name ("the four codes"), and the `DEMO_TOOLS` comment in `.env.example`.
