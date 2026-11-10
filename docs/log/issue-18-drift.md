# Issue 18 and 20, the docs drift: time log

Branch `docs/issue-18-drift` from `origin/main` at `ee83059`, worktree `.claude/worktrees/agent-a0650bda074e3032e`. Real clock (Helsinki), 2026-11-10: every time below is from `date "+%H:%M"` or a commit stamp. One docs pull request for [issue 18](https://github.com/Tonttu84/northfina-lease-loop/issues/18) and [issue 20](https://github.com/Tonttu84/northfina-lease-loop/issues/20) (the audit of 2026-11-10): each claim checked against the code on `main` first, then the doc made to match the code. No product code changes; the one code change is the name of the `isAuthzRefusal` test.

- 11:55 branch created; `npm run setup` started.
- 11:55 to 12:00 read `AGENTS.md`, both issues, `src/domain/authz/policy.ts` and `policy.test.ts`, `src/server/authorize.ts`, every `route.ts` under `src/app/api/` (where each reads the body and where it calls `authorize`), the leases, `customers/[id]`, account and application pages, `src/server/demo-tools.ts` and every caller of `demoToolsOn()`, `docs/features/STATUS.md`, `docs/decisions.md`, `docs/features/authorization.md`, `docs/features/signatories.md`, `.env.example`, the README. Mapped each branch cited in a decided row to its pull request with `gh pr list -R ThomasParratt/northfina-lease-loop` (the team's hackathon repository, whose numbers the `(#N)` squash subjects on `main` carry) and `gh pr list -R Tonttu84/northfina-lease-loop`, and checked the D numbers in each squash commit's body.
- 12:00 `npm run setup` failed: robocopy did not finish copying `node_modules` within the script's 5-minute limit. Re-run in the background (robocopy skips the files already copied).
- 12:00 to 12:04 the edits: STATUS rows, the decision references and the header sentence, the authorization page, the signatories page, the `.env.example` comment, the README line, the test name; then the grep of `docs/` for repeats of the corrected claims and their fixes (below).
- 12:05 setup finished on the second run (4 min 26 s in all); `npx prettier --write` on the changed files.
- 12:05 to 12:08 six commits: `f393b9c` STATUS rows, `c257d29` decision references, `775047b` the authorization page, `fbf7123` signatories and question flow, `de2ff4d` the test name, `0d53b6b` `DEMO_TOOLS` in `.env.example`, the README and `security.md`.
- 12:08 to 12:15 `npm run check:all` green on the first run: format, lint, typecheck, file size, no-AI, secrets, 170 test files with 2 005 tests, coverage 97.73 % lines, build. The no-AI meta test did not time out this time.
- 12:15 this log, commit `afaf335`.
- 12:15 to 12:19 the second `npm run check:all` at `afaf335`, green: the same 170 test files and 2 005 tests, coverage 97.73 % lines, build.
- 12:19 to 12:22 push and [PR 24](https://github.com/Tonttu84/northfina-lease-loop/pull/24) opened (12:22 by GitHub's `createdAt`); not merged.
- 12:28 the rule-13 review by a fresh session at `afaf335`: approve with fixes; two low findings (a test citation in `question-flow.md` that did not exist, this log left open) and three nits (D81's branch citation, the two repositories' PR numbers in STATUS, a `user-portal.md` wording, left as it is on the coordinator's word).
- 12:28 to 12:30 findings 1 to 4 fixed: the `question-flow.md` test-table row cites `src/server/applications.test.ts` "review finding 1: the company account posting a decision gets signatory_required; the admin too"; this log closed; D81 cites `PR #69` only and the decisions header says "a decided or built row"; one sentence in STATUS's "After the hackathon" section names which repository its PR numbers are on. Commit `docs: the review of PR 24`, push, the **Reviewed** line in the PR body, then CI on the new head.

## What the checks found

Every claim of issue 18 held on `main` at `ee83059`, with these refinements:

- "Its rule order differs from `can()`": the page's numbered list was already in the order the code runs; what it missed was step 4's exception (`sign_contract` is `customer_signs` for the admin, D88). The comment above `can()` in `policy.ts` lists the steps in another order (the signatory list before the admin) than the code runs them; it is product code, so it is not changed here.
- "Before it reads the body": `POST /api/applications` reads and validates the body before it authorizes too (the customer is named in it), not only `POST /api/contracts`.
- The table already had `read_account`; it lacked `withdraw_application` and had the admin's `sign_contract` wrong.

Found by the grep and fixed (each repeats a corrected claim):

- `docs/features/security.md`, demo mode: listed the clock, the runner and the picker as demo tools, not the sign-in links' outbox (D94).
- `README.md`: "The demo tools (the clock and the Run buttons)".
- `docs/security-overview.md`, Limits of the authorization section: only `POST /api/contracts` named as validating the body first.
- `docs/features/user-portal.md`: "The check is D26's …; `src/server/authorize.ts` can replace it"; both portal pages call `authorize` with `read_leases`.
- `docs/features/signatories.md` (step 2 of card 6, two test-table rows) and `docs/features/question-flow.md` (card 6, the `decideApplication` signature comment, a test-table row): the decision page refuses with `NOT_SIGNATORY`, a code that no longer exists in `src/`; it is 403 `FORBIDDEN` with `signatory_required` (D73, D74), as `applications.test.ts` and the applications route test pin.
- `docs/features/STATUS.md`: the D91 row (Playwright) was still "in progress"; PR #6 merged on 2026-11-08.

## Left undone

- `docs/decisions.md`: rows that name neither a branch nor a PR were left as they are (D17 to D20, D42, D45 "wave 2 upkeep", D77 "product-review fixes", which could be team PR #62, #63 or #65). D81 cited `#69` and its branch; since the review it cites `PR #69` only. D73 and D74 say "built", not "decided"; only their branch reference was replaced (team PR #61). D91 is still "proposed … decided when its PR merges" although PR #6 merged; changing a status is not a reference fix, so it is left for the owner. D39 still says the decision page answers `NOT_SIGNATORY`; a decision's text is not changed here.
- The message key `demo.toolsOff.body` (four languages) names only the clock and the scenario cards; it is product text shown on the demo page, not changed here.
- The `isAuthzRefusal` test asserts two of the five codes; only its name was changed, as the brief allowed.
- Logs and reviews under `docs/log/` and `docs/reviews/` keep their historical wording.
