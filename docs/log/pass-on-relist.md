# Time log: the pass-on relists and prices the item right

Branch `fix/pass-on-relist` from `main` f1a6f44. The coordinating session (Claude Fable), from the
polish review of 2026-11-08 (`docs/reviews/polish-2026-11-08.md`, bugs 1, 2 and 6): the newest
slice, the D90 pass-on (#89), relisted the item in the customer's raw reported condition and had
no second-life price for the held item, so the price page and the signing priced it from the list.

| Time (Helsinki) | Step                                                                                                                                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15:38           | Worktree `.claude/worktrees/fixes`, `npm run setup`, branch.                                                                                                                                                                                                                                                          |
| 15:46           | `exitContract` passes the plan's event condition (D77-clamped) and usage to `startNextDeal`, not the raw report. `latestRepricing` in `asset-events.ts`; `secondLifePriceCents` reads it first, the assessment row as the fallback. `next-deal.ts` comment.                                                           |
| 15:48           | Two scenario tests in `pass-on-next-deal.test.ts`: card 8 passed on prices at 259 230 on the price page, the preview and the signing; `ebike-005` (like_new) reported "new" is relisted like_new, signed next day under list v2 at the quote's rent.                                                                  |
| 15:50           | Green with the fix; both new tests fail without it (408 400 instead of 259 230; `new` instead of `like_new`).                                                                                                                                                                                                         |
| 15:52           | `docs/features/exits.md`: the relist condition, the passport as the price's source, the 14-day hold (was "30 days"), the tests. This log. Related test files, then `npm run check:all`.                                                                                                                               |
| 16:0x           | `npm run check:all` green (164 files, 1 886 tests, build). Committed as eade98e, pushed to the team repo as PR #95, then to the user's copy as PR #2 (the team repo stays at the submitted state).                                                                                                                    |
| 21:48           | Review of the branch: the test name said more than the test checked; renamed (047341f).                                                                                                                                                                                                                               |
| 01:0x (9 Nov)   | Fresh review of PR #2: D63 and `second-life.md` still named the assessment row as the price's source; both now name the passport's `repriced` entry. A pass-on plan without its event throws instead of skipping the next deal. The price page's older-assessment notice beside a pass-on price is a known gap below. |

**Chosen:** the price is read from the passport's newest `repriced` entry rather than by writing a
`ReturnAssessment` row in the exit: both the assessment and the pass-on already write that entry
with the amount, so one read covers both paths and the assessment table keeps one meaning (an
inspection happened). The assessment row stays as the fallback for rows written before the entry
carried the amount.

**Left undone:** the price page shows the held item at the quote's amount but without a notice
saying why (and for an item assessed, leased, passed on and later released by the admin, the notice
names the older assessment's amount beside the pass-on price) (`secondLife.priceNote` names an assessment, which a pass-on has none of; a wording of
its own needs a key in all four languages). The named customer still cannot make a quote of their
own on the reserved item; they take the held quote from My leases, as the D90 row says.
