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
- 12:37 to 12:42 `origin/main` merged in at `db54e9c` (PR 24, the docs drift). `docs/decisions.md` conflicted: main's D92 to D94 were kept, and the D97 row went after them as the last row. The other files merged cleanly, with no stale "no test checks" or grep-only wording left. `npm run check:all` green: 170 test files with 2,012 tests, coverage 97.73 % lines, build.
- 12:58 to 13:08 `main` merged in again at `e324cf8` (PR 22, CI pins and npm audit). `docs/decisions.md` and `docs/features/security.md` conflicted; both sides were kept. The table ends D94, D96, D97, and the feature page has the D96 bullet, then D97. `npm run check:all` green (12:59 to 13:01); merge `3923f4f` pushed; CI passed.

## The review of PR 23 and its fixes

- 13:05 read the rule-13 review of `3923f4f`. Verdict: approve with fixes. It found nine things:
  1. The body trace matched names, not objects.
  2. A body read the trace could not see was skipped.
  3. `any`, `unknown` and `custom` passed as leaves.
  4. `z.looseRecord` and any-string keys behind a union or a pipe passed.
  5. A line starting with a block comment was skipped whole, and a `better-sqlite3` import was not caught.
  6. `.catch()` passed.
  7. A recursive schema overflowed the stack.
  8. The docs overclaimed.
  9. `git ls-files` had no deadline.
- 13:06 to 13:08 fail first: findings 1 to 6 planted together with a script in the session's scratchpad (the reviewer's holes, plus `better-sqlite3`). `tests/meta-rules.test.ts` stayed 19/19 green. Finding 7 planted alone, a self-recursive loose `z.lazy` in the login body: red with only "RangeError: Maximum call stack size exceeded".
- 13:08 to 13:14 the fixes. The walker and the tracer moved to `tests/helpers/strict-body.ts`, with their tests (the four old ones unchanged, seven new) in `tests/strict-body.test.ts`; with the fixes, `tests/meta-rules.test.ts` would have gone over 600 lines. The trace follows each schema through the route file's own import, refuses a local declaration, fails on `request.json()` and the like and on a call it cannot trace, and checks that every table row with a body is parsed. The walker flags open values, `.catch()`, loose records and any-string keys behind a union or a pipe, and keeps the path's definitions so recursion is walked once. The raw-SQL scan cuts comments out of a line instead of skipping it, and also fails on a `better-sqlite3` import. `git ls-files` has `timeout: 20_000`. All seven holes planted again: three tests red with 16 findings, each naming the route or the file and line. Reverted, green. Commit `7fa9dcf`.
- 13:14 to 13:16 the docs: the overview's validation and raw-SQL sections and the feature page say what the tests catch and cannot (a `z.preprocess` fails as an open value, a renamed `readJsonBody` import and server code handed the request are not seen, a `//` in a string hides the rest of its line). D97 cites PR #23.
- 13:17 to 13:19 `npm run check:all` green: format, lint, typecheck, file size, no-AI, secrets, 171 test files with 2,019 tests, coverage 97.73 % lines, build. Then the push, the **Reviewed** line in the PR body, and CI (green on `3eef2c6`).

## The re-review and its fixes

- By 13:44 read the second fresh review, of `3eef2c6`. Verdict: approve with fixes; all nine findings confirmed fixed by planting each hole again. It found five new things:
  1. Low regression: the comment cut treated a `//` or `/*` inside a string as a comment.
  2. Low gap: a raw body read through a cast, a clone or a line break passed in a handler with no body row, and so did one in `src/server`.
  3. Low gap: a renamed `readJsonBody` import hid an untraced read.
  4. Nit: `bodyReadsIn` read comments as code.
  5. Nit: the docs (the overview's Where and Proof, D97's decision text, this log).

  Note 6 (the forward check matches a row by path, not method) is left as a note.

- 13:44 to 13:45 fail first, with a second plant script in the scratchpad: the reviewer's two string lines in `src/server/quotes.ts`, `(request as Request).json()` and `request.clone().json()` in the actor route's `DELETE`, a `r.clone().json()` helper in `src/server/actor.ts`, and `readJsonBody as rj` in the demo-clock route. `tests/meta-rules.test.ts` stayed 15/15 green. The comment "Never call request.json() here" above the quotes route's `POST` was red: the false positive.
- 13:45 to 13:47 the fixes: `codeLines` in `tests/helpers/code-text.ts` cuts comments only outside strings and template literals, and both the raw-SQL scan and `bodyReadsIn` read it. `RAW_BODY_READ` matches `.json()` and its kin on anything, and `.body` except a spread and `route.body` (`src/server/openapi.ts` reads the table's schema there). It runs on every `route.ts` and every non-test file in `src/server` but `api-response.ts`. A renamed `readJsonBody` or `readBodyText` fails. Holes planted again: two tests red, naming `src/app/api/actor/route.ts`, `src/app/api/demo/clock/route.ts` (renamed reader), `src/server/actor.ts:97` and `src/server/quotes.ts:312` and `:313`; the comment no longer fails. Reverted, green. Commit `794bf78`.
- 13:47 to 13:50 the docs: the overview's Where and Proof name the helpers and `tests/strict-body.test.ts`. The Limits drop what the fixes catch (a renamed reader, server code, a `//` in a string). D97's decision text says what the tests do now.

## Left undone

- `dangerouslySetInnerHTML` is still checked by the grep only; issue 17 asked for raw SQL, so no meta test was added for it.
- Query strings and route params stay `z.object` (unknown query keys are dropped, not refused); the issue is about bodies.
- `scripts/` is not scanned for raw SQL: `scripts/tamper-audit.mjs` is the tamper demo and needs it.
- The tests read source text and schema definitions, not requests, so a few things are out of reach:
  - a body read outside `src/app/api` and `src/server`;
  - what a `z.preprocess` function does (it fails as an open value instead);
  - a route file with two methods that both take a body, whose schemas could be swapped (re-review note 6: the forward check matches a row by path, not by method; no route has two today).
