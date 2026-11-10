# History

How this repository got to where it is, moved out of `AGENTS.md` when the project moved onto the owner's shared ai-workflow rules (D101). `AGENTS.md` keeps only the current rules; the version before the move is `AGENTS.md` at commit `be97ab7`.

## The hackathon

Lease Loop was built by Team LeaseMasters (three people and Claude Code sessions) in 24 hours at the Northfina × Hive Helsinki hackathon, November 2026, on the organiser's starter and synthetic data pack ([etufillari/northfina-lease-loop](https://github.com/etufillari/northfina-lease-loop), tag `v1.0-kickoff`). The brief is `CHALLENGE.md`; the engineering rules it was judged on are `RULES.md`. The team's repository was `ThomasParratt/northfina-lease-loop`; this one, `Tonttu84/northfina-lease-loop`, is a standalone copy that carries the work on. Decision rows up to D90 cite pull requests by their number on the team's repository, from D92 on by their number here (see the header of `docs/decisions.md`).

- The plan: `docs/kickoff-brief.md`. Its section 10, the practice repository `ThomasParratt/leasing-platform` as a parts bin (functions ported with their tests, never its structure), was for the hackathon only: nothing is ported from it any more, and that clone is not a source here.
- How the waves of parallel agent sessions ran, with their hardening and review-and-upkeep agents: `docs/team-notes.md`, "How we worked"; the reviews after every wave: `docs/reviews/`; one time log per task: `docs/log/`.
- What the team corrected along the way, and how it used the AI tools: `docs/submission.md`.

## After the hackathon

- The review rule (`AGENTS.md` team rule 13) was set by PR 9 (Panu's second-life texts, team PR 93): ported, reviewed by a fresh session, its findings fixed and pushed, the fixed head reviewed again, then merged. Every pull request since follows that pattern.
- The 2026-11-10 audit opened issues #16 to #19 (action pins and the npm audit, strict body schemas and no raw SQL, docs drift, layout); #16 to #18 are closed by PRs 22, 23 and 24.
- On 2026-11-10 the project moved onto the owner's shared rules ([Tonttu84/ai-workflow](https://github.com/Tonttu84/ai-workflow)) as a showcase project: `AGENTS.md` as the map, the shared commit check in `.githooks/` and CI, Dependabot on the 1st and 15th, function limits reported (D101 to D105).
