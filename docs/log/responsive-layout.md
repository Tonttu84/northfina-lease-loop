# Responsive layout: time log

Branch `test/responsive-layout` from `origin/main` at `f58503b`, worktree `.claude/worktrees/responsive`. Real clock (Helsinki), 2026-11-10. The user asked whether the frontend is truly responsive (any screen size, any language, the reader's text size) and wants it proven by automated tests, not by someone looking at screenshots.

- 10:13 worktree and branch, `npm run setup`.
- 10:13 to 10:20 the first version of `e2e/layout.ts` (sideways scroll, out of the viewport, text overflow, tap targets on phones) and `e2e/10-responsive-layout.spec.ts` (19 pages, each as its actor, the cards run through `/api/demo/cards/N/run`, nine screen sizes).
- 10:20 to 10:30 run 1 on the built app: 19 of 19 failed, mostly a false positive (the screen-reader-only 1 px boxes, now excluded). Real: the audit chain's "anchored" badge spills in Finnish, Swedish and Estonian at 320 px on `/demo` and `/audit`; the item page's life stamp spills only during its `stamp-press` animation (`scale(1.18)` for about 400 ms), which led to the `animatedOverflow` check.
- 10:30 to 10:35 the text sizes (150 %, 200 % on 390, 768 and 1280 px), every language, the vertical and `textNotScaling` checks, and pseudo-localization (D95): `src/i18n/pseudo.ts` with its tests, the gate in `isLocale`, `translated` for the question texts.
- 10:30 a second agent session takes over: AGENTS.md, the state of the worktree. The padding word `ťéẋť` (ẋ is U+1E8B, outside the fonts' `latin-ext`) becomes `ťéšť`; `translated('qps-long', …)` is pinned as `[Möoñťĥľýy íiñçöomée ľöñğ ťéšť]`; a new test holds every character of `qps-long` to ASCII, Latin-1, Latin Extended-A or the English file's own. `vitest run src/i18n`: 39 tests green; lint and typecheck green.
- 10:31 to 10:36 run 2, with the build (`.next/BUILD_ID` at 10:32): 19 of 19 failed in 287 s, 2 768 findings. While it ran: the D95 row, the STATUS row, the README and feature-list lines, spec 10 in `e2e-tests.md`.
- 10:36 to 10:41 each check vetted on examples in a throwaway spec. Four false positives, fixed in `e2e/layout.ts`: the content of a closed `<details>` (the header's menu, the price breakdown) is laid out but not shown, so the checks now skip what `checkVisibility()` hides; 468 `textOverlapsBelow` findings were 4 to 7 px of glyph ink under tight heading line heights (the next element starts 32 px below), so vertical overflow now needs more than half a line; the leases rows' links are stretched over their card by an absolute `::after`, and the 13 to 16 px radios sit in 44 px labels, so the tap area now takes the label and the stretched box; WCAG 2.5.8's spacing exception is applied. Confirmed real: the life stamp's first keyframe, the badge (the page 382 px wide at 320 px), and `textNotScaling` catching an injected 14 px text.
- 10:41 to 10:46 run 3 (`E2E_SKIP_BUILD=1`, only test code changed): 294 s; no `textOverlapsBelow` or `smallTargets` left. A tablet at 150 % text squeezed a two-column grid to 14 px cells: the text size was a `font-size` on `<html>`, which does not move the rem breakpoints, so no reader would see that layout. Vetted `Page.setFontSizes` (the browser's own setting): the breakpoints move and the tablet gets the phone header. `useViewport` now uses it.
- 10:48 run 4 stopped at once: the protocol refuses 19.5 px (13 × 1.5); rounded. 10:51 to 10:56 run 4: 19 of 19 failed in 316 s, 739 findings (150 page scroll, 414 out of the viewport, 241 text overflow, 84 animation). 10:56 to 10:58 a last vet (two injected 16 px buttons side by side are still flagged), the wide-screen metrics.
- 10:58 to 10:59 the other specs on the same build: 13 passed in 1.2 min; the pseudo-languages broke nothing.
- 10:59 to 11:00 `docs/features/responsive-layout.md`, the run times in `e2e-tests.md`, this log.
- 11:01 to 11:02 `npm run check:all` green at the first try: 171 files, 2 020 tests, coverage 96.4 % statements, build.
- 11:03 commits `2f36b8f` (`feat(i18n)`, D95) and `90fc6b8` (`test(e2e)`); `0b799d0` (`docs(responsive)`).
- 11:04 to 11:05 the passport scrolled sideways at 1280 px with 200 % text with no element named: a `visibility: hidden` popover widens the page and the checks skip hidden boxes. `pageScroll` now names the box that reaches furthest, hidden ones included; an `<svg>` root is now checked like any box (only what is inside a drawing is skipped).
- 11:05 to 11:09 run 5: 19 of 19 failed in 244 s, the same 739 findings as run 4 in the same groups; the passport's culprit is named. 11:10 docs updated; 11:10 to 11:13 `npm run check:all` green (2 020 tests, build); 11:13 `be3cec7` (`test(e2e)`), 11:15 `e4a9aae` (`docs(responsive)`), 11:15 `a05328b` this row's correction of two commit times. Nothing pushed.

## Left undone

- The layout findings themselves (the page's open questions list them): fixing them is the next step, the user's decision.
- A pass with every `<details>` opened (the header menu spills when open at 150 % and 200 % text).
- The review (AGENTS.md rule 13), the push and the pull request.

## Session 2: the fixes, issue 19 (2026-11-10)

Branch `fix/responsive-layout` from `test/responsive-layout`, `origin/main` merged in (`9b24799`, no conflict), worktree `.claude/worktrees/agent-ac221473361db2557`. The owner's rule of 2026-11-10: the spec lands only once it passes in full; fix the layout, never the checks. No check was changed.

- 11:59 worktree, branch, merge, `npm run setup` (the `node_modules` copy timed out at its 5-minute limit once; the second run finished it).
- 12:10 to 12:23 run 6 on the merged branch, with the build: 19 of 19 pages failed, 889 findings (150 `pageScroll`, 414 `outOfViewport`, 241 `textOverflow`, 84 `animatedOverflow`: the same groups as runs 4 and 5, whose "739" left out the 150 `pageScroll` lines). The two new tests ran in it and failed as intended: the header 170 px signed in against 126 px signed out at 768 px in en, fi, sv and et; the catalogue 3 columns at 1920 and 2560 px, the catalogue 1152 px and my leases 896 px at 2560 px.
- 12:24 `test(e2e)` commit: the header and wide-screen tests, written before any fix (the decision row is D98: D96 and D97 are taken by PRs 22 and 23).
- 12:25 to 12:44 the fixes, iterated against `next dev` on `e2e.db` with a throwaway Playwright config: dev run 1 (12:34 to 12:44, code changing during it) 16 of 21 passed, 67 findings left, all at 390 px with 200 % text (the catalogue's price amounts, the second-life plan's amounts, the how-it-works steps, the passport's lives, the version picker in `qps-long`, the category chips); dev run 2 (12:45 to 12:47) on those five pages: 0.
- 12:47 screenshots of the old build (before) for comparison.
- 12:48 run 7 could not start: the dev server still held `e2e.db` (EPERM); stopped it. 12:49 to 12:56 run 7 with the build: 21 of 21 passed, 0 findings.
- 12:57 to 13:01 screenshots of the new build, read one by one: three things looked worse and were changed. `wrap-anywhere` on every button let the staff strip squeeze "Continue" / "Jatka" to one letter a line; the catalogue's "Sähköpyörät" chip broke its word because the count shrank with it; the hero and page headings broke words at 200 % text. Fixes: the actor picker's button `shrink-0`, the chip's count `shrink-0` and a smaller padding under 20 rem, the biggest headings one size smaller under 20 rem, cards and notices `p-3` under 20 rem.
- 13:02 to 13:08 run 8: 2 tests failed, 4 findings: with `wrap-anywhere` taken off the buttons, "Avaa allekirjoituslinkki" (fi) and the account's button in `qps-long` ran past a 390 px phone at 200 % text. Put back on every button (`max-w-full wrap-anywhere`), with `shrink-0` where a row must not squeeze one (the actor picker).
- 13:09 to 13:14 run 9 with the build: 21 of 21 passed, 0 findings. 13:14 to 13:16 screenshots again (staff strip whole, chips, hero, contract, 1280 px catalogue unchanged against the old build, 2560 px catalogue with four columns) and the badge measured for the worked example.
- 13:16 to 13:17 commits `cc873af` (`fix(layout)`), `0258903` (`fix(header)`), `626e4ca` (`feat(layout)`, D98).
- 13:17 the whole browser suite (`npm run test:e2e`) and the docs: the feature page (passes, the fixes by root cause, the two tests, open questions shrunk), `STATUS.md`, `e2e-tests.md`, this log.
- 13:17 to 13:24 `npm run test:e2e` with the build: 34 passed in 6.4 min (the nine other specs and the 21 tests of this one).
- 13:24 to 13:26 `npm run check:all` green at the first try: 171 files, 2 020 tests, coverage 96.35 % statements, build.
- 13:27 `docs(responsive)` commit; `origin/main` merged again (#22 took D96, #24, #25; only the decisions table and STATUS.md conflicted: main's rows kept, D95, D98 and the responsive row added); push (the pre-push hook green), pull request #27; D95 and D98 decided as PR 27.

## Left undone (session 2)

- A pass with every `<details>` opened, and browsers other than Chromium (the feature page's open questions).
- Hyphenation in the test browser: none, so a long word breaks without a hyphen there; real browsers with the language's dictionary hyphenate the headings.
- The review (AGENTS.md rule 13): a fresh session reviews the pull request; the author does not.
