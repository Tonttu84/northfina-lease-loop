# Strict body schemas and no raw SQL: time log

Branch `test/strict-schemas-no-raw-sql` from `origin/main` at `ee83059`, worktree `.claude/worktrees/agent-aedd3d346a6a57c3d`. Real clock (Helsinki), 2026-11-10: every time below is from `date`. Issue 17: tests that every request body schema is strict and that app code runs no raw SQL.

- 11:55 branch from `origin/main`; `npm run setup` started in the background. It stopped at its 5-minute robocopy limit (12:00); run again, it finished at 12:05 (4 min 39 s).
- 11:55 to 11:59 read `AGENTS.md`, issue 17, `tests/meta-rules.test.ts`, `src/server/routes.ts` and `routes.test.ts`, every `*-schemas.ts` body schema, `readJsonBody` and the assessment route's own reader; `node_modules/zod` is 4.6.7, and `z.strictObject()` sets `catchall: never()` in `v4/classic/schemas.js`. Greps: every body read in a `route.ts` is `readJsonBody(request, X)` except the assessment route (`assessmentBodySchema.parse(body)`); `$executeRaw` only in two test files and `scripts/tamper-audit.mjs`.
- 11:59 to 12:02 the tests in `tests/meta-rules.test.ts` (493 lines, under the limit, so no new file): `looseSpots` and its own tests, the strict-body test from the route table, the body trace from each `route.ts` to its row, the raw-SQL line scan. Docs: `docs/security-overview.md` (validation and no-raw-SQL sections, the contents row), `docs/features/security.md`, `AGENTS.md`, the README's feature link, D95.
- 12:05 to 12:07 the meta tests green (19); a dynamic ``import(`../${file}`)`` drew a Vite warning, so the schema modules are imported as `../src/server/${name}.ts`. Lint and `npm run typecheck` clean.
- 12:08 to 12:10 fail first, nothing committed: `reportedUsageSchema` as `z.object`, a `$queryRawUnsafe` line appended to `src/server/quotes.ts`, and `src/app/api/sign/[token]/route.ts` reading its body with `looseSignBody`. Three tests red with "POST /api/contracts/[id]/exit: body.usage accepts unknown keys", "src/app/api/sign/[token]/route.ts parses its body with looseSignBody, not its row's body in routes.ts" and "src/server/quotes.ts:311 runs raw SQL; use the Prisma query builder" plus "… calls a Prisma …Unsafe method". `git checkout -- src`, green again. No real loose body or raw call was found on `main`.
- 12:10 commit `68ba9a9` (the tests).
- 12:12 the docs commit: the overview's wording on records, this log.
- 12:13 to 12:17 `npm run check:all` green on the first run: format, lint, typecheck, file size, no-AI, secrets, 170 test files with 2,012 tests (seven new), coverage 97.73 % lines, build. Then the pull request; the review (rule 13) is the coordinator's to start.

## Left undone

- `dangerouslySetInnerHTML` is still checked by the grep only; issue 17 asked for raw SQL, so no meta test was added for it.
- Query strings and route params stay `z.object` (unknown query keys are dropped, not refused); the issue is about bodies.
- `scripts/` is not scanned for raw SQL: `scripts/tamper-audit.mjs` is the tamper demo and needs it.
