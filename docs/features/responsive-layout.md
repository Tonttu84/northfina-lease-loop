# Responsive layout: every page at every screen size, language and text size

## What it does

`e2e/10-responsive-layout.spec.ts` opens 19 pages of the built app, each as the actor who sees it and after the scenario card it needs, in the four shipped languages and two generated pseudo-languages, at nine screen sizes from a 320 px phone to a 2560 px screen and at the reader's 150 % and 200 % text, and asks the browser itself what is broken: sideways scroll, something out of the viewport (also during an animation), text escaping or clipped, a tap target under 24 px on a phone, text that ignores the reader's size. It answers the question "is the frontend truly responsive" with a list of elements and numbers instead of screenshots someone has to look at; it fails today, and its findings are the work list.

## The rule

**The checks (`e2e/layout.ts`, `checkLayout` and `checkTextScales`).** Each runs in the page on the layout as it is now, on every rendered element (`checkVisibility()`: the content of a closed `<details>` such as the header's menu or the price breakdown is laid out but not shown, and a screen-reader-only 1 px box is off the page on purpose; both were false positives before they were excluded).

| Check                              | Fails when                                                                                                                                                                                                                                                                              | Why it exists                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageScroll`                       | the document is wider than the viewport                                                                                                                                                                                                                                                 | WCAG 2.2 1.4.10 (reflow): content at 320 CSS px needs no scrolling in two directions.                                                                                                                                                        |
| `outOfViewport`                    | an element reaches past either edge and no ancestor below `<body>` scrolls or clips sideways (`overflow-x: auto`, `scroll`, `hidden`, `clip`: a table's wrapper holds its table); only the outermost offender is listed                                                                 | names the element that causes `pageScroll`, and catches what sticks out of a page that clips it.                                                                                                                                             |
| `animatedOverflow`                 | the same, at any of seven points (0 % to 100 %) of a running CSS animation, sampled with the animation paused and put back                                                                                                                                                              | the settled page can look fine while an entrance animation pokes past the edge: the item page's life stamp starts `stamp-press` at `scale(1.18)` and wobbles a phone sideways for 420 ms on every load.                                      |
| `textOverflow`                     | text is wider than its own box (`scrollWidth > clientWidth`) in an element that lets it spill (`overflow-x: visible`)                                                                                                                                                                   | a word or number that cannot wrap (a Finnish compound, a date, an e-mail address) runs over its neighbour even when nothing reaches the viewport's edge.                                                                                     |
| `textOverlapsBelow`, `textClipped` | text is taller than its box by more than half a line: running over what follows (`overflow-y: visible`) or cut off                                                                                                                                                                      | a fixed height the text outgrew. Up to half a line is the glyphs' ink above and below a tight line height, which every large heading has (run 2 flagged 468 such headings by 4 to 7 px; nobody sees it).                                     |
| `smallTargets`                     | on a phone (430 px or narrower), a link, button, field or `summary` whose tap area is under 24 × 24 CSS px, except a link inside a sentence and an undersized target with room around it (a 24 px circle on its centre touches no other target and no other undersized target's circle) | WCAG 2.2 2.5.8 (target size, minimum) with its exceptions. The tap area is the larger of the control and what taps it: its own `<label>` (the 13 px radios sit in 44 px labels) and a link stretched over its card by an absolute `::after`. |
| `textNotScaling`                   | with the root font size doubled in place, an element's text grows less than 1.5 times                                                                                                                                                                                                   | WCAG 2.2 1.4.4 (resize text): a size in `px` ignores the reader's setting. Run once per page and language.                                                                                                                                   |

**Metrics, not assertions.** `checkLayout` also returns the widest element inside `<main>` that is not full-bleed (what the content uses), the most columns any grid shows and the header's height; the spec attaches them to the report as `layout-metrics`. How much of a 2560 px screen the content should use is a design decision, not breakage (open questions).

**The viewports.** 320 × 640, 360 × 780 and 390 × 844 (phones), 844 × 390 (a phone in landscape), 768 × 1024 (tablet), 1280 × 800, 1440 × 900, 1920 × 1080 and 2560 × 1440; then 150 % and 200 % text on 390, 768 and 1280: fifteen in all.

**The reader's text size is the browser's setting.** `useViewport` sets Chromium's default font sizes through the DevTools protocol (`Page.setFontSizes`, what chrome://settings/fonts changes: 16 px and 13 px fixed-width times the zoom), not a `font-size` on `<html>`. The app's breakpoints are in rem (`sm` 40rem, `md` 48rem, `lg` 64rem), and a media query's rem is the browser's default size, which an `<html>` style does not move: with the style, a 768 px tablet at 200 % text kept the desktop header and squeezed a two-column grid to 14 px wide cells, a layout no reader ever gets; with the real setting it gets the phone layout, as the reader would. Run 3 used the style and reported 351 `textOverflow` and 599 `outOfViewport` findings; run 4 with the setting, 241 and 414.

**The languages.** `en`, `fi`, `sv`, `et`, and the pseudo-languages `qps-long` and `qps-short` (D95), each page loaded once per language and laid out at every viewport.

**Pseudo-localization (D95, `src/i18n/pseudo.ts`).** Two made-up languages generated from `en.json` at start-up, the way Google (`en-XA`), Microsoft (`qps-ploc`) and Mozilla test a layout's room for languages they do not ship yet:

- `qps-long`: every letter accented from Latin-1 and Latin Extended-A (`a` → `á`, `t` → `ť`: the `latin-ext` subset the fonts load, so a missing glyph shows at once), every vowel doubled (longer words, which cannot wrap, like Finnish compounds), padded with accented filler words (`ľöñğ`, `ťéšť`, `ĥéřé`, `ýéš`, `ŵöřď`) up to IBM's expansion for the string's length, and wrapped in `[ ]` so a clipped string shows a missing bracket. "Catalogue" (9 characters, target 18) is `[Çáaťáaľöoğüuée ľöñğ]`; "Monthly income" (14, target 26) is `[Möoñťĥľýy íiñçöomée ľöñğ ťéšť]`. Over the whole English file the long language is at least 1.3 times as long.
- `qps-short`: every word cut to its first letter and its consonants, at most four letters ("Catalogue" → `Ctlg`, "Send me a sign-in link" → `Snd m a sgn-in lnk`): under three quarters of the English, for layouts that assume a text fills its box.
- `{placeholders}` are kept exactly: the names, amounts, dates and ids put into them come from the data, which a translator does not touch either; numbers and dates format like English (`intlLocale`).

IBM Globalization Design's text-expansion guideline, the lower bound of each band (`expansionFactor`):

| English length (characters) | Expansion | Factor |
| --------------------------- | --------- | ------ |
| up to 10                    | 100–200 % | 2      |
| 11–20                       | 80–100 %  | 1.8    |
| 21–30                       | 60–80 %   | 1.6    |
| 31–50                       | 40–60 %   | 1.4    |
| 51–70                       | 31–40 %   | 1.31   |
| over 70                     | 30 %      | 1.3    |

The pseudo-languages are URL languages like `fi` (`/qps-long/catalogue`). `isLocale(value, env)` accepts them only while the demo tools are on (D74: development, the tests, a pitch build with `DEMO_TOOLS=1`), so a plain production build answers 404; the language switcher lists only the four shipped languages. Texts held per shipped language outside the message files (the data pack's question texts on the apply and application pages) go through `translated(locale, read)`, which runs the English through the generator for a pseudo-language.

**Worked example, the audit chain's badge.** On `/fi/demo` at 320 px, the anchoring badge "Ankkuroitu tietokannan ulkopuolelle · merkintään N asti" is a `shrink-0` pill that cannot wrap: it spans 50 to 382 px, so the page is 382 px wide in a 320 px viewport (`outOfViewport` and `pageScroll`); on `/fi/audit` 33 to 365 px. On `/demo` at 320 px the English badge, "Anchored outside the database · up to entry N", spans 50 to 330 px, the Swedish one 50 to 349 and the Estonian one 50 to 351 (on `/audit`, which starts it 17 px further left, English fits and Swedish and Estonian reach 332 and 334); at 360 px only the Finnish one still spills (to 382 px). It is the one finding of the four shipped languages at the default text size apart from the life stamp's animation and one Finnish date (`4. marraskuuta 2029` on card 1's contract, 115 px in a 106 px box at 320 px).

## Decisions

- **D95** pseudo-localization for the layout tests, gated by the demo tools switch (this page).
- **D74** the demo tools switch the pseudo-languages ride on.
- **D91** the browser tests on the built app this spec runs in (one worker, reset and reseed per test, the actor through the real routes).

## Pure functions

`src/i18n/pseudo.ts` (no clock, no I/O, Vitest in `pseudo.test.ts`):

- `expansionFactor(length: number): number`: the IBM lower bound for an English string of `length` characters (table above).
- `pseudoLocalize(message: string, mode: 'long' | 'short'): string`: one message in a pseudo-language; placeholders and blank messages are kept.
- `pseudoMessages(source, mode): Record<K, string>`: every message of a language, the keys unchanged.

`src/i18n/locales.ts`:

- `isLocale(value: string, env = process.env): value is Locale`: a shipped language always, a pseudo-language only while `demoToolsOn(env)`.
- `translated(locale: Locale, read: (shipped: ShippedLocale) => string): string`: `read(locale)` for a shipped language, the English pseudo-localized for a pseudo one.

Test code, in the page (`e2e/layout.ts`):

- `checkLayout(page, { phone }): Promise<{ problems, metrics }>`: the checks above at the current viewport; `problems` is `{ check, element, detail }[]` with the element as `tag.class "text"` and the numbers in `detail`.
- `checkTextScales(page): Promise<LayoutProblem[]>`: the `textNotScaling` check; puts the page back afterwards.
- `useViewport(page, viewport): Promise<void>`: the viewport size and the browser's text size, then two animation frames.
- `VIEWPORTS`, `TEXT_ZOOMS` (`[1.5, 2]`), `LOCALES`.

## Files

- `e2e/layout.ts`: the checks, the viewports, the languages, `useViewport`.
- `e2e/10-responsive-layout.spec.ts`: the 19 pages and how each is reached (the actor, `POST /api/demo/cards/N/run`, a sign-in link), one test per page, 300 seconds each.
- `src/i18n/pseudo.ts`, `src/i18n/pseudo.test.ts`: the generator.
- `src/i18n/locales.ts`: `pseudoLocales`, `ShippedLocale`, `PseudoLocale`, `isLocale` with the gate, `translated`, the pseudo-languages' names and Intl tags.
- `src/i18n/get-t.ts`: the two generated message sets beside the four files.
- `src/i18n/i18n.test.ts`: the gate and `translated`.
- `src/app/[locale]/apply/[quoteId]/page.tsx`, `src/app/[locale]/applications/[id]/page.tsx`: the question texts through `translated`.
- `docs/decisions.md` (D95), `docs/features/e2e-tests.md` (spec 10), `docs/features/STATUS.md`, `README.md`.

**How to run it.** `npx playwright test e2e/10-responsive-layout.spec.ts` builds the app first, like every browser test (`E2E_SKIP_BUILD=1` reuses `.next/`); add `--reporter=list,json` with `PLAYWRIGHT_JSON_OUTPUT_NAME=<file>` to keep the findings and the `layout-metrics` attachments as JSON. Every finding is one line of the failure message: `[fi phone-320] outOfViewport: span.inline-flex.shrink-0.items-center "Ankkuroitu tietokannan ulkopuolelle · me" — spans 50 to 382 in a 320 px viewport`. Run time on a Windows laptop: 19 tests in 5 min 16 s on a built app (8 to 27 s a page), about 6½ minutes with the build. `npm run test:e2e` runs it with the other specs, so CI's browser job fails while the findings stand.

## Tests that pin the numbers

| Test                               | What it pins                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/pseudo.test.ts`          | The IBM bands (`expansionFactor(10)` 2, `(11)` 1.8, `(70)` 1.31, `(71)` 1.3); "Catalogue" → `[Çáaťáaľöoğüuée…`, `Ctlg`; every message reaches its target length; placeholders kept; the whole English file ≥ 1.3 × long and < 0.75 × short; every character of `qps-long` is ASCII, Latin-1, Latin Extended-A or already in `en.json`. |
| `src/i18n/i18n.test.ts`            | `isLocale('qps-long')` true in development and with `DEMO_TOOLS=1`, false in production and with `DEMO_TOOLS=0`; `qps-other` never; no pseudo-language among `locales`; `translated('qps-long', …)` is `[Möoñťĥľýy íiñçöomée ľöñğ ťéšť]`, `translated('qps-short', …)` `Mnth incm`.                                                    |
| `e2e/10-responsive-layout.spec.ts` | No finding on any of the 19 pages at any of the 15 viewports in any of the 6 languages. Fails today (open questions).                                                                                                                                                                                                                  |

## Open questions

- **The findings of run 4 (2026-11-10).** All 19 pages fail. At the default text size the shipped languages fail only on the audit badge at 320 px (and 360 px in Finnish) on `/demo` and `/audit`, the life stamp's entrance animation on the item pages (to 322 px at 320, 362 at 360, 392 at 390), and card 1's Finnish end date at 320 px. At 150 % and 200 % text on a 390 px phone almost every page spills: headings with one long word (`Catalogue` at 200 % is 440 px in a 326 px box, `Kirjautumislinkkisi` 571 px), `shrink-0` badges and pills, e-mail addresses in `dd` cells (`aino.virtanen@example.com` to 449 px), the catalogue's card grid (to 487 px), the contract's exit sections (to 435 px) and the portal's invoice rows. `qps-long` adds the header at 200 % (the menu button to 420 px) and the home page's "See the catalogue" link. No `textNotScaling`, `smallTargets` or vertical-overflow finding remains. Which of these to fix, and how, is the next step's decision.
- **Wide screens.** The content stays at its `max-w-*` at every width: at 1280, 1920 and 2560 px the home, catalogue, item and audit pages use 1152 px (90 %, 60 %, 45 %), second life and the contract 1024 px (80 %, 53 %, 40 %), the leases pages and the demo page 896 px (70 %, 47 %, 35 %), the passport and the signatories 768 px (60 %, 40 %, 30 %), the apply, application, signing, sign-in and account pages 672 px (52 %, 35 %, 26 %). The catalogue shows 3 columns and the portal's totals 4 at every width from 1280 up. Whether a 2560 px screen should get more columns or wider content is a design rule the spec does not assert.
- **An opened menu.** Only the closed header menu is checked. Opened on a 390 px phone it is `w-64` aligned right: 16 rem, so at 150 % text it spans −18 to 366 px and at 200 % −154 to 358 px, past the left edge. A pass with every `<details>` opened would catch it; not built.
- **Chromium only.** `Page.setFontSizes` is a DevTools protocol call; Firefox and WebKit would need their own way to set the reader's text size.
- **The metric counts scrolled content.** The widest element is taken across `<main>`, a table inside its own scroller included: card 1's contract reports 1057 px in Finnish and 1263 px in `qps-long` against 1024 px in English.
