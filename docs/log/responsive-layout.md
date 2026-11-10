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

## Session 3: the review's findings (2026-11-10)

The rule-13 review of PR 27 at `a1c342f` (approve with fixes, ten findings) and the owner's two decisions of 2026-11-10: the contract keeps its width on wide screens (D98's exception), and the header's links fold into the menu below 1024 px for everyone (D99). Checks first, seen to fail on the unchanged app, then the layout; no existing check was loosened.

- 15:42 read the review. 15:43 to 15:47 the new checks in `e2e/layout.ts` (`overlap`, `brokenWord`, inline elements in `textOverflow`, `hidden` and `clip` no longer scrollers, `document.fonts.ready`) and in the spec (the page again with the menu open, the header test at 1024 and 1100 px, the contract at 2560 px in the D98 test).
- 15:47 to 15:55 run 10 on the unchanged build (`E2E_SKIP_BUILD=1`): 20 of 21 failed, 1 436 findings (852 `overlap`, 296 `brokenWord`, 228 `outOfViewport`, 60 `textOverflow`). Real: the staff strip's select over "Demo" (finding 1), the open menu to −154 px (finding 4), "Turvallisuustarkastus" and "Säkerhetsbesiktning" beside their amounts, "Continue", "See the cata|logue", "Maatalouskon|eet", the brand in `qps-long`, hyphenated "pe-rioodi", "inloggnings-länk" and "lukus-tatud" (finding 3), the calculator's "€71.64" and the contract's "€107.30" running out of their tag (the inline check), the contract at 1280 px. False positives, fixed in the checks before any layout change: the life stamp's tilted lines (a rotated box's rectangle is its bounding box; transformed boxes are now left out of `overlap`), a word measured without its glued "[" and words within a pixel of their column (now the whole run and a 1 px margin). The hidden and clip change found nothing else.
- 15:47 to 16:00 the fixes: the pseudo-languages behind getters and the switch in a module that imports nothing (finding 8; the getter test seen to fail on the old `get-t.ts`); the strip and the menu; label minimums; one label box in buttons; price tag sizes; chip counts; no `hyphens: auto`; the 16 rem grid; the contract's width; D98's exception and D99.
- 15:55 `test(e2e)` commit `ad9eeae`. 16:00 to 16:09 run 11 with the build: 19 of 21 failed, 152 findings, all `brokenWord` on the staff strip's button ("Continue", "Fortsätt"): `flex-1` is `flex: 1 1 0%`, so the picker never wrapped and squeezed its button; it now has `min-w-min`, and the select starts at 6 rem.
- 16:10 to 16:12 commits `1a17c97` (`fix(header)`), `c5c1336` (`fix(layout)`), `c380b0e` (contract, D98, D99), `0a65515` (`refactor(i18n)`). Merged `main` (#23 meta tests, #26 Tailwind 4.3.5; README and the decisions table conflicted: main's rows kept, D95, D98 and D99 added); `npm ci` for Tailwind 4.3.5.
- 16:15 to 16:21 run 12 with the build: 21 of 21 passed, 0 findings.
- 16:21 screenshots, read one by one: the strip at 390 px with 200 % text (select, then the button on its own row), the open menu at 150 % and 200 % (inside the screen, the language pills two by two), the second-life plan at 150 % (the amount under "Turvallisuustarkastus"), the contract's tag and the calculator at 200 %, the Estonian how-it-works at 360 px (no hyphen), the header at 1280 and 1024 px (one row; the select grows to 14 rem on a wide strip, about 54 px wider than before), the contract at 2560 px (1024 px), the Finnish dates at 320 px (one column, each date on one line). Worse: "Catalogu|e" at 390 px with 200 % text (fits nothing, so the check allows it); the title now steps down one more size under 16 rem (`383865a`).
- 16:22 to 16:28 run 13 with the build: 20 of 21 passed, 8 findings, all on the demo page in `qps-long`: the check took the audit chain's short head hash ("37ce…22", new on every run) for the word "ce". The check's own definition leaves ids out; it now strips only punctuation from a token's ends, so a token with a digit is no word (`a9c4b28`). Run 12 had passed only because its hash broke elsewhere.
- 16:28 to 16:34 `npm run test:e2e` with the build: 34 passed in 6.2 min.
- 16:34 to 16:40 run 14 (`E2E_SKIP_BUILD=1`, only the check changed): 21 of 21 passed, 0 findings.
- 16:40 `npm run check:all` failed on the feature page's formatting only; 16:50 to 16:52 after `prettier --write`, green: 173 files, 2 047 tests, coverage 96.35 % statements, build.
- 16:53 `docs(responsive)` commit, push, the PR body's **Reviewed:** line.

## Left undone (session 3)

- Browsers other than Chromium; an animation that ends without a fill before the check (`price-flip`, `audit-card-in`): the feature page's open questions.
- A second review of the fixed head (AGENTS.md rule 13: a fix beyond a finding is reviewed again).

## Session 4: the merge of PR 31 and the re-review's findings (2026-11-10)

- 18:19 merged `main` (PR 31, the README front page, D100): `docs/decisions.md` (main's D96, D97, D100 kept, D95, D98, D99 added in order) and `README.md` (main's front page; the responsive layout page in the Features group "The app" and in the "Since the hackathon" sentence). 18:19 to 18:21 `npm run check:all` green (173 files, 2 047 tests); merge `a31b0cb`, pushed; CI green.
- 18:31 read the re-review at `833d2d0` (approve with fixes; findings A to E). Each check change proven both ways with a throwaway spec of planted faults on the same build: 18:32 the plants pass the old checks (a 6 rem heading "Kunnostussuunnitelma", a `dt` squeezed to 0 with its text in a `div`, a 3 rem grid track, the life stamp moved onto the item's `h1` with and without its animation: 5 of 5 missed); 18:34 and 18:35 after the fixes all 5 caught, with messages such as `"Kunnostussuunnitelma" breaks across 2 lines though it is 161 px and its column has 324 px` and `h1 "Urban 1" crosses span "ELÄMÄ 3"`. The plant spec deleted.
- 18:36 to 18:42 run 15 (the stricter checks, the old build): 4 of 21 failed, 76 `brokenWord` findings: text squeezed beside an icon (the how-it-works steps, the decision panel, the passport card). Fixed (rows wrap, text takes 10 rem and its longest word), with the catalogue card's padding ("KUUKAUDESSA", finding C), smaller card titles under 20 rem and soft hyphens in three Finnish titles (finding D), and the nits (E).
- 18:46 to 18:51 run 16 with the build: 2 of 21 failed, 5 findings, all on the soft-hyphenated titles: a probe showed Chromium counts the drawn hyphen in the next word's first rectangle; that rectangle is now dropped (`121bd65`). 18:53 to 18:58 run 17 (`E2E_SKIP_BUILD=1`): 21 of 21 passed, 0 findings.
- 18:59 to 19:00 screenshots: "KUUKAUDESSA" whole at 390 px with 200 % text, the how-it-works steps under their numbers at 200 % and unchanged at 100 %, the passport card's text under its booklet, "Aino Virtanen" whole at 320 px, "Hinta, lukittu alle- / kirjoitettaessa" at 320 px, the plan at 200 %. Worse: "Turvallisuustarkast / us" still without a hyphen; soft hyphens added there too, in Finnish and Swedish (`f199a86`).
- 19:00 to 19:06 run 18 with the build: 21 of 21 passed, 0 findings. 19:06 to 19:12 `npm run test:e2e` with the build: 34 passed in 6.2 min.
- 19:12 to 19:14 `npm run check:all` green at the first try: 173 files, 2 047 tests, coverage 96.35 % statements, build. Then the `docs(responsive)` commit, push, the PR body's **Reviewed:** line with the re-review.

## Left undone (session 4)

- Browsers other than Chromium; `price-flip`, which ends without a fill and is missed if it finished before the check (the feature page's open questions).
- More soft hyphens: only five compounds have one; other Finnish words longer than a phone's line at 200 % text break without a hyphen.
- A third review of the fixes after the re-review, if the team wants one.
