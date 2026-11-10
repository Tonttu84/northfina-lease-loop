# Strict body schemas and no raw SQL: time log

Branch `test/strict-schemas-no-raw-sql` from `origin/main` at `ee83059`, worktree `.claude/worktrees/agent-aedd3d346a6a57c3d`. Real clock (Helsinki), 2026-11-10: every time below is from `date`. Issue 17: tests that every request body schema is strict and that app code runs no raw SQL.

- 11:55 branch from `origin/main`; `npm run setup` started in the background. It stopped at its 5-minute robocopy limit (12:00); run again, it finished at 12:05 (4 min 39 s).
- 11:55 to 11:59 read `AGENTS.md`, issue 17, `tests/meta-rules.test.ts`, `src/server/routes.ts` and `routes.test.ts`, every `*-schemas.ts` body schema, `readJsonBody` and the assessment route's own reader; `node_modules/zod` is 4.6.7, and `z.strictObject()` sets `catchall: never()` in `v4/classic/schemas.js`. Greps: every body read in a `route.ts` is `readJsonBody(request, X)` except the assessment route (`assessmentBodySchema.parse(body)`); `$executeRaw` only in two test files and `scripts/tamper-audit.mjs`.
- 11:59 to 12:02 the tests in `tests/meta-rules.test.ts` (493 lines, under the limit, so no new file): `looseSpots` and its own tests, the strict-body test from the route table, the body trace from each `route.ts` to its row, the raw-SQL line scan. Docs: `docs/security-overview.md` (validation and no-raw-SQL sections, the contents row), `docs/features/security.md`, `AGENTS.md`, the README's feature link, D97.
- 12:05 to 12:07 the meta tests green (19); a dynamic ``import(`../${file}`)`` drew a Vite warning, so the schema modules are imported as `../src/server/${name}.ts`. Lint and `npm run typecheck` clean.
- 12:08 to 12:10 fail first, nothing committed: `reportedUsageSchema` as `z.object`, a `$queryRawUnsafe` line appended to `src/server/quotes.ts`, and `src/app/api/sign/[token]/route.ts` reading its body with `looseSignBody`. Three tests red with "POST /api/contracts/[id]/exit: body.usage accepts unknown keys", "src/app/api/sign/[token]/route.ts parses its body with looseSignBody, not its row's body in routes.ts" and "src/server/quotes.ts:311 runs raw SQL; use the Prisma query builder" plus "… calls a Prisma …Unsafe method". `git checkout -- src`, green again. No real loose body or raw call was found on `main`.
- 12:10 commit `68ba9a9` (the tests).
- 12:12 the docs commit: the overview's wording on records, this log.
- 12:13 to 12:17 `npm run check:all` green on the first run: format, lint, typecheck, file size, no-AI, secrets, 170 test files with 2,012 tests (seven new), coverage 97.73 % lines, build. Then the pull request; the review (rule 13) is the coordinator's to start.
- 12:22 to 12:24 the decision renumbered from D95 to D97 (D95 is the pseudo-localization branch's, D96 is PR 22's). The pre-push test run then timed out the new raw-SQL scan (5.7 s) and "no file clears a table" (6.6 s) under load.
- 12:27 to 12:32 `tests/meta-rules.test.ts` now keeps each listing and each file it reads (two Maps), so the tree is read once per run. The meta rules get a 30 s timeout with its reason in a comment; the no-AI test lives in this file, so it is covered too. No assertion changed. Two full `npm test` runs before and two after, all green. The slowest meta tests before were no-AI at 2.27 s and 1.73 s, the file-size test at 0.67 s and 0.92 s, "clears a table" at 0.69 s and 0.93 s, and the raw-SQL scan at 0.25 s and 0.44 s. After, they were no-AI at 1.28 s and 1.47 s, the file-size test at 1.25 s and 0.79 s, "clears a table" at 0.89 s and 0.63 s (the first to read the test files), and the raw-SQL scan at 0.06 s twice.

## Left undone

- `dangerouslySetInnerHTML` is still checked by the grep only; issue 17 asked for raw SQL, so no meta test was added for it.
- Query strings and route params stay `z.object` (unknown query keys are dropped, not refused); the issue is about bodies.
- `scripts/` is not scanned for raw SQL: `scripts/tamper-audit.mjs` is the tamper demo and needs it.
