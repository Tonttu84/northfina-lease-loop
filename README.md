# Lease Loop

[![CI](https://github.com/Tonttu84/northfina-lease-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/Tonttu84/northfina-lease-loop/actions/workflows/ci.yml)

One e-bike, laptop or farm machine, three lives. Lease Loop lets a customer lease an item: it quotes a monthly price from the day's price list, asks only the questions the amount needs, fixes the price in a signed contract, bills each month with the VAT in force on that invoice's date, and itemises a fair price for leaving early. When the item comes back, the app values it, offers it to the next customer on a waiting list by fixed rules and leases it again, and every item has a passport showing the CO₂ and money its later lives saved. It is built with Next.js, TypeScript, Prisma on SQLite and Zod, and has no AI in the product: only rules, data and integer cents.

**Result:** shared first place at the 24-hour Northfina × Hive Helsinki hackathon (5–6 November 2026) as Team LeaseMasters; all ten scenario cards of the organiser's brief (worked cases whose exact numbers the judges compared) run end to end and are pinned by tests ([Status](#status)).

**Since the hackathon** (9–10 November 2026), Johannes has added the signed session and sign-in by e-mail link (D92–D94), security hardening and the [security overview](docs/security-overview.md), the Playwright browser tests (D91), the CI supply-chain pins (D96) and the meta checks for strict request bodies and raw SQL (D97).

## What to look at

- **Separation of concerns.** Business rules are pure functions in [`src/domain/`](src/domain/) (no I/O, no clock, dates passed in), with a test file next to each module. Route handlers in `src/app/api/` parse bodies with the Zod schemas of their row in [`src/server/routes.ts`](src/server/routes.ts) (the source of [docs/openapi.json](docs/openapi.json)) and call the services in `src/server/`; storage is [`prisma/schema.prisma`](prisma/schema.prisma).
- **Money.** Integer euro cents, factors in millionths, and one rounding rule, half up once, in `roundHalfUpDiv` ([`src/domain/money-math.ts`](src/domain/money-math.ts), D1).
- **Audit chain.** Every write goes through `withAudit()` ([`src/server/audit.ts`](src/server/audit.ts)) in one transaction; each row is hash-chained and Ed25519-signed, the chain's head is anchored outside the database, and a pure verifier names the first broken row ([docs/features/audit-chain.md](docs/features/audit-chain.md)).
- **Security.** [docs/security-overview.md](docs/security-overview.md): every security feature with its threat, its test and a one-minute demo.
- **Decisions.** [docs/decisions.md](docs/decisions.md): every numbered decision from the kickoff on, each with its reason and what was chosen against.
- **Tests.** Vitest unit tests next to the code; property tests (`*.property.test.ts`) for the invoice schedule, the quote, the question flow and events; every scenario card on the real data pack and end to end on a migrated database ([docs/scenarios.md](docs/scenarios.md)); Playwright browser tests in [`e2e/`](e2e/); and [`tests/meta-rules.test.ts`](tests/meta-rules.test.ts), which fails on a file over 600 lines, AI in the app, an impure or untested domain module, a route without `handleRoute` or `authorize`, or a write outside `withAudit`.

## Team

| Name     | GitHub                                            | Main focus                                                                                                                                                   |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Johannes | [Tonttu84](https://github.com/Tonttu84)           | coordination and decisions; pricing, invoicing, contracts, exits, second life, signatories, the demo cards                                                   |
| Thomas   | [ThomasParratt](https://github.com/ThomasParratt) | asset statuses, row schemas, the decision race, question-flow validation, the Sign button, the signed and anchored audit chain, PR reviews                   |
| Panu     | [panu-kangas](https://github.com/panu-kangas)     | the look, landing and catalogue pages, the price page, the passport card, My leases, catalogue sort, stepping back from an application and who signs a lease |

## Quick start

Git and Node.js 22 (with [nvm](https://github.com/nvm-sh/nvm): `nvm install` reads `.nvmrc`).

```bash
git clone https://github.com/Tonttu84/northfina-lease-loop.git
cd northfina-lease-loop
nvm install          # Node 22
npm ci               # installs dependencies and the Git hooks
npm run db:setup     # creates .env and a local SQLite database with the 30 assets
npm run dev          # http://localhost:3000
```

The landing page opens in English (Finnish, Swedish and Estonian are in the header). `http://localhost:3000/en/demo` has one Run button per scenario card; the pitch walkthrough is [docs/demo.md](docs/demo.md).

Sign in by e-mail link, no password: enter a customer's e-mail from the data pack, or `backoffice@leaseloop.example`, on `/en/login` and open the link from the demo page's outbox, since no e-mail leaves the demo. The demo tools (clock, Run buttons, "Continue as", outbox) are on under `npm run dev`; on a production build see [docs/demo.md](docs/demo.md#the-demo-tools-and-signing-in).

| Command             | What it does                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run setup`     | Set up a checkout or worktree: dependencies, database, hooks                                            |
| `npm run dev`       | Start the app with hot reload                                                                           |
| `npm test`          | Run all Vitest tests once                                                                               |
| `npm run check:all` | **Everything CI runs** (format, lint, types, file size, no AI, secrets, coverage, build)                |
| `npm run test:e2e`  | Build the app and click the pitch run through with Playwright (once: `npx playwright install chromium`) |
| `npm run db:reset`  | Wipe the local database and seed it again                                                               |

Every other command, and a code tour of the files to read first: [docs/team-notes.md](docs/team-notes.md#code-tour).

## Status

One row per scenario card of the brief ([CHALLENGE.md](CHALLENGE.md) section 4), amounts in euro cents unless marked €; how the cards are tested, every test that proves them, the D31 assumption, the traps, the surprise drills and the smart problems: [docs/scenarios.md](docs/scenarios.md).

| Card               | What the judges compare                                                                        | Works | Proved by                              |
| ------------------ | ---------------------------------------------------------------------------------------------- | ----- | -------------------------------------- |
| 1 Happy path       | `ebike-003`, 36 months: band B, net 10 730, gross 13 466; buyout 58 350; total 486 612         | yes   | `card-01-happy-path.test.ts`           |
| 2 The price lock   | `laptop-004`: v1 349 000 (rent 9 627) stays locked under v2 321 100 (rent 8 857)               | yes   | `card-02-price-lock.test.ts`           |
| 3 Tax is not price | `ebike-001` from 15 Sep 2026: net 6 957; December gross 8 731, January 8 766                   | yes   | `card-03-tax-is-not-price.test.ts`     |
| 4 Calendar traps   | `laptop-001` from 31 Jan 2026: net 3 432; due 28 Feb 2026 and 29 Feb 2028                      | yes   | `card-04-calendar-traps.test.ts`       |
| 5 Too young        | Mikko (17), `laptop-008`: too young until 10 Mar 2027                                          | yes   | `card-05-too-young.test.ts`            |
| 6 Who can sign?    | Norvi, `ebike-004`: 549 000, band B, rent 15 144; `awaiting_signatory`                         | yes   | `card-06-who-can-sign.test.ts`         |
| 7 Big ticket       | `farm-002`, 48 months, 2 000 000 down: band D, rent 272 038; buyout 1 000 000; manual review   | yes   | `card-07-big-ticket.test.ts`           |
| 8 Early exit       | Card 1 in month 7: market value 311 200 (D31); buy 330 675, return 75 945                      | yes   | `card-08-early-exit.test.ts`           |
| 9 Second life      | `ebike-007`: battery and inspection only; `wait-02` wins; relisted at 115 976, rent 6 497      | yes   | `card-09-second-life.test.ts`          |
| 10 Third life      | `ebike-008`: leased at 1 194; its passport: 58 kg CO₂ and 665,60 € saved after this third life | yes   | `src/server/scenarios/card-10.test.ts` |

## Features

One page per slice under `docs/features/` ([template](docs/features/README.md)); the state of each (missing, in progress, done, verified) is [STATUS.md](docs/features/STATUS.md).

- **Leasing:** [pricing and quotes](docs/features/pricing.md), [the question flow and the application](docs/features/question-flow.md), [contracts and signing](docs/features/contracts.md), [company signatories and the signing link](docs/features/signatories.md), [invoicing: VAT by invoice date, the balance](docs/features/invoicing.md), [exits: buy out, return, pass on, early exit](docs/features/exits.md)
- **Circular life:** [second life: assessment, matchmaking and re-pricing](docs/features/second-life.md), [circular impact and the passport](docs/features/circular-impact.md)
- **The app:** [catalogue, asset statuses, demo clock, actor and audit trail](docs/features/catalogue.md), [My leases](docs/features/my-leases.md), grown into the [user portal](docs/features/user-portal.md), [the look](docs/features/look.md), [demo cards: one button per scenario card](docs/features/demo-cards.md)
- **Accounts and access:** [accounts: sign in by e-mail link, the demo outbox](docs/features/accounts.md), [authorization: who may do what, checked before the action](docs/features/authorization.md)
- **Audit and security:** [the tamper-evident audit chain, signed and anchored](docs/features/audit-chain.md), [security: demo mode, headers, signed session, limits, strict bodies, no raw SQL](docs/features/security.md), and the [security overview](docs/security-overview.md) with every feature's threat, test and one-minute demo
- **Data and tests:** [row schemas](docs/features/row-schemas.md), [test isolation](docs/features/test-isolation.md), [browser tests: the pitch run clicked through with Playwright](docs/features/e2e-tests.md)

## How we worked

At the hackathon: three people and Claude Code as a pair programmer, over two days. Our rules on top of the organiser's (test first, contract first, one owner per table, integer cents, codes instead of sentences, one reviewed, squash-merged pull request per task) are in [AGENTS.md](AGENTS.md); every decision with its reason: [docs/decisions.md](docs/decisions.md); how the waves of parallel agent sessions ran and how the app is put together: [docs/team-notes.md](docs/team-notes.md); the reviews after every wave and after the hackathon: [docs/reviews/](docs/reviews/). Also: the mentor questions, all answered ([docs/mentor-questions.md](docs/mentor-questions.md)); our submission, with how we used the AI tools ([docs/submission.md](docs/submission.md)); one time log per hackathon task ([docs/log/](docs/log/)).

## Credits and license

Built on the hackathon starter and synthetic data pack by [Northfina](https://www.northfina.fi) ([etufillari/northfina-lease-loop](https://github.com/etufillari/northfina-lease-loop), MIT; the tag `v1.0-kickoff` is where the starter ends and our work begins). The brief: [CHALLENGE.md](CHALLENGE.md); the engineering rules we were judged on and still test against: [RULES.md](RULES.md); the data pack: [data/DATA.md](data/DATA.md). We wrote the code with Claude Code as a pair programmer; every commit says so in its trailer.

MIT, see [LICENSE](LICENSE). The starter skeleton and the synthetic data pack in `data/` are © 2026 Northfina under MIT. Northfina's note on it: "This license covers the starter code and data pack in this repository. Code written by hackathon teams belongs to those teams." Everything built on it since is © 2026 the team, under the same MIT terms.
