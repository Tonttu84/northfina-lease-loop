# Lease Loop

A circular-economy leasing app where one e-bike, laptop or farm machine lives three lives: priced, leased, returned, passed on or sold second-hand. Built by Team LeaseMasters at the Northfina × Hive Helsinki hackathon (November 2026) and kept going as a showcase; how it was built: `docs/history.md`.

## Shared rules

This project follows the owner's working agreements: https://github.com/Tonttu84/ai-workflow/blob/main/rules/working-agreements.md
(Claude Code loads them in every session through the user-level `CLAUDE.md`; other tools should read that file.)
This file holds only what is specific to this project and wins where it says so.

**Priority of sources.** The organiser's `CHALLENGE.md` (the brief), `RULES.md` (the engineering rules the hackathon was judged on, still applied), `data/DATA.md` and the data pack win over everything else in this repository; `docs/kickoff-brief.md` and `docs/decisions.md` come second. `tests/meta-rules.test.ts` (in `npm test`) checks the repository against them: it fails on a file over 600 lines, AI in the app, a domain module without a test, an impure domain file, a route without `handleRoute`, a write outside `withAudit`, a request body schema that lets an unknown key through or raw SQL in app code.

## Kind

**Showcase**: branch, pull request, fresh-agent review, squash-merge on the owner's word. The details are team rules 10 and 13 below.

## Stack

- Language and framework: TypeScript (strict), Next.js 16 App Router, React 19, Tailwind 4, on Node 22 (`.nvmrc`).
- Data: SQLite through Prisma 7 with the better-sqlite3 adapter; schema in `prisma/schema.prisma`, generated client in `src/generated/prisma` (git-ignored). Zod 4 for every schema; the data pack is read-only JSON in `data/`, its schemas in `src/data/schemas.ts`.
- Tests: Vitest (unit, handler and meta tests, 60 % coverage gate on `src/domain`, `src/server`, `src/data`, `src/i18n`), fast-check for properties, Playwright (Chromium) on the built app.
- Hooks: husky runs `.husky/` (secret scan, lint-staged, commitlint, the pre-push checks); `.husky/pre-push` first runs the shared ai-workflow commit check in `.githooks/`, which CI's `commit-check` workflow runs too (D102).
- Hosting: none; runs locally. CI on GitHub Actions (`ci.yml`, `commit-check.yml`).

The stack came with the organiser's starter; `docs/kickoff-brief.md` is the hackathon plan, `docs/stack-notes.md` the traps met on it.

## Commands

| Task                                                                              | Command                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Set up a fresh clone (husky's `prepare` installs the Git hooks)                   | `npm ci`, then `npm run db:setup`                            |
| Set up a worktree (copies `node_modules` from the main checkout, database, hooks) | `npm run setup`                                              |
| Run the app                                                                       | `npm run dev` (http://localhost:3000)                        |
| Unit tests                                                                        | `npm test` (`npm run test:coverage` with the coverage gate)  |
| End-to-end tests                                                                  | `npm run test:e2e` (once: `npx playwright install chromium`) |
| Lint, format, type-check                                                          | `npm run lint`, `npm run format:check`, `npm run typecheck`  |
| Function limits, a report that never fails (D105)                                 | `npm run lint:limits`                                        |
| The local gate before every push (tests, lint, types, build)                      | `npm run check:all`                                          |
| Dependency audit (network; CI runs it)                                            | `npm audit --audit-level=high`                               |
| After a change to `prisma/schema.prisma`                                          | `npm run db:migrate`                                         |

Every command: `docs/team-notes.md`, "Commands".

## Domain rules

The organiser's rules (`RULES.md`), in short:

- **No AI inside the product.** Never add an AI, ML or LLM SDK, model or API call to the app. All product logic is rules, data and algorithms. `npm run check:no-ai` enforces this.
- **Business logic goes in `src/domain/`** as pure functions: no I/O, no database, no `fetch`, no `Date.now()` / `new Date()` / `Math.random()`. Pass dates (ISO `YYYY-MM-DD`) and data in as arguments. Every function gets Vitest tests next to it, including edge cases.
- **Money is integer euro cents.** Never use floating-point euros for amounts. Round once, deliberately, and document the rule.
- **API routes** use `ok()` / `fail()` / `handleRoute()` from `src/server/api-response.ts`. Never return raw error messages or stack traces.
- **Every data change** goes through `withAudit()` in `src/server/audit.ts`. Use the `tx` it gives you for every write in that change.
- **Database changes:** edit `prisma/schema.prisma`, then run `npm run db:migrate`. Never hand-write migration SQL.
- **UI strings** go in `src/i18n/messages/{en,fi,sv,et}.json`, with the same keys in all four.
- **Files stay under 600 lines.** Split by responsibility.
- Read `data/DATA.md` before using the data pack.

### Team rules

Numbered, since code and docs cite them by number ("AGENTS.md rule 11").

1. **Test first.** The domain function's test file exists before the function; the test names the card or the trap it proves. A handler test mocks nothing it does not own.
2. **Contract first.** A slice's first commit is its Zod schemas (params, body, response) and its row in the route table (`src/server/routes.ts`); the others build against them before the handler exists.
3. **One owner per table and per shared shape** (`docs/kickoff-brief.md` section 6). Another slice's rows are read through the owner's read function, never with a query on its table. A change two slices must make at one instant is an event inside the transaction (section 7), not a call.
4. **Dates are ISO day strings passed in.** `todayIso()` is called once per request in the page or the route and passed down; the demo clock override lives there and nowhere else. No endpoint trusts a date from the browser except the demo override.
5. **Money is integer cents and the factor is integer millionths.** Multiply cents by the factor in millionths and divide once, rounding half up to the cent, in one function with the rule in its comment.
6. **Outcomes are codes with params, never sentences.** The domain returns `{ code, params }`; the page writes it from the message files in the visitor's language.
7. **Nothing is hard-coded to a scenario card.** A test may pin a card's numbers; the code never knows the card exists.
8. **Write it down.** A decision goes into `docs/decisions.md` with its reason, what was chosen against and its status (the file's header says how numbers are allocated). Every agent task keeps a time log in `docs/log/<task>.md` on the real clock, times from `date` and commit stamps, never guessed: steps, commits, what blocked it, what it left undone (the shared rules let a project keep its time logs). The README stays current in the same commit as the change. Every feature slice ships `docs/features/<slice>.md` in the same PR as its code, in the shape of `docs/features/README.md`: what it does (two sentences); the rule or formula with a worked example on the scenario-card numbers; the decisions it implements (D numbers); the inputs and outputs of its pure functions; the files; the tests that pin the numbers; open questions. The README holds only a "Features" list linking those pages, beside the "Status" table; a stale feature page is a review finding. The README's short "Status" row, the card's full row in `docs/scenarios.md` and the feature's row in `docs/features/STATUS.md` change together in the PR that changes a card's behaviour or its tests; the tables' shape changes only with a decision (D100 set the current one).
9. **Worktrees.** A task runs in its own worktree on its own branch (the desktop app puts them under `.claude/worktrees/`); its first command there is `npm run setup`, which copies `node_modules` from the main checkout instead of running a fresh `npm ci`.
10. **Branches and merges.** Nobody pushes to `main` directly, not even docs or tooling: every change is a branch and a pull request on this repository. A branch is named `<type>/<slice>` with the conventional-commit type as prefix (`feat/pricing`, `chore/ai-workflow-migration`); a session that starts on a generated name renames it with `git branch -m` before its first push. The branch carries many small conventional commits; the PR is **squash-merged** as one `type(scope): subject` commit whose body lists the pieces, and its title is that subject (the repository's squash setting uses the title, D103). Every PR body has a "Docs" line linking the feature page(s) it ships or changes as files on the branch (e.g. `[docs/features/circular-impact.md](docs/features/circular-impact.md)`). Never rebase a shared branch.
11. **Every loop ends.** The shared rules' deadline rule, applied here: a command, script or test that waits, polls or retries has a hard deadline or an iteration cap and then fails with a message.
12. **Done means** `npm run check:all` green, the tests of the change in the same commit, the route in the route table and the OpenAPI file regenerated (`npm run openapi`), the message keys in all four files, the README section current, the time log closed, the review done and its findings fixed (rule 13).
13. **Every pull request is reviewed before it merges**, docs, tooling and dependency bumps included, by a teammate when one is at hand, otherwise by a fresh agent session as the shared rules describe. The reviewer posts the verdict on the PR (`gh pr review <n> --comment --body-file <file>`; `--approve` when the reviewer's GitHub account is not the author's, since GitHub refuses a self-approval). Before the squash-merge the PR body summarises the verdict and the fixes under a **Reviewed** line, so the commit on `main` carries them too.

## Layout

- `src/domain/`: pure business logic with its tests; `src/domain/rows/` the write schema of every row.
- `src/server/`: the IO edge: Prisma client, `withAudit`, the route table, sessions, each slice's reads and writes.
- `src/app/`: App Router pages (`[locale]/...`) and API routes (`api/...`); `src/components/`: client components.
- `src/data/`: schemas and loaders for the data pack in `data/`; `src/i18n/`: the four message files.
- `tests/`: meta rules, hook tests, the test database (`tests/helpers/test-db.ts`); `e2e/`: Playwright.
- `scripts/`: setup, the file-size and no-AI checks, OpenAPI, the audit demo scripts.
- `docs/`: decisions, feature pages, scenarios, time logs, reviews, stack notes, the security overview, the history.
- `.husky/`: the hooks husky runs; `.githooks/`: the shared commit check, copied unchanged from ai-workflow (do not edit; copy a newer version from there).

## Quirks

- A fresh worktree has no `.husky/_` (git-ignored, per folder), so its hooks do not run until `npm run setup` has.
- `.husky/` hooks run under `sh -e`: one command per line, never `a && b` (`tests/husky-hooks.test.ts`).
- After pulling anything that touches `prisma/`, run `npx prisma generate`: the generated client is per worktree.
- `next dev` writes the block below into this file; it is committed on purpose.
- More traps: `docs/stack-notes.md`.

## Decisions

`docs/decisions.md` (D1 onward; its columns predate the shared template and are kept: question, decision, why and what was rejected, status).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
