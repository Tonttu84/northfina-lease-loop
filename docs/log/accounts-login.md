# Accounts and the sign-in link (D93, D94): time log

Branch `feat/accounts-login` from `feat/signed-session` (PR 13), worktree `.claude/worktrees/accounts`. Real clock (Helsinki), 2026-11-09. The second slice: accounts, the e-mail link, the demo outbox, the account page. The user's rule for the demo: the demo page carries no admin gate, every visitor has the demo's implied powers, admin and customer are split only where a safety feature is being shown.

- 10:09 branch; read the signatory token flow (the pattern for the link), `withAudit`, the row schemas and their test, the meta rules (public allowlist, seed functions), the demo page and the header.
- 10:10 `prisma/schema.prisma`: `Account`, `LoginToken`; `prisma migrate dev --name accounts_login`.
- 10:11 to 10:13 `src/domain/rows/account.ts` and `src/domain/accounts/login-link.ts` with tests, the row examples, `schema-columns`, `read_account` in the policy and its table: 99 domain tests green.
- 10:14 to 10:18 `src/server/accounts.ts`, the contract schemas, the refusal envelopes, the two login routes, the route table rows, the actor route's demo gate, the seed, the public allowlist; typecheck green (Prisma client regenerated).
- 10:16 the review of PR 13 arrived; committed this work as a WIP, fixed PR 13 on its branch (nine findings), pushed `f068de5`, a fresh re-review started; back here, rebased onto it.
- 10:33 to 10:40 the pages (sign in, the link, the account), the demo outbox, the header (Sign in / Account, the picker only while the demo tools are on), 62 message keys in four languages; typecheck and lint green.
- 10:41 to 10:46 `accounts.test.ts`, the login route tests, the actor route's demo-off case, `reset-db` with the two tables, `e2e/09-login-outbox.spec.ts`, `npm run openapi`: 212 tests green on the first run.
- 10:47 this page, D93 and D94, the authorization, security and demo pages, the feature list, STATUS, the README, this log.
