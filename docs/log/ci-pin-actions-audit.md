# Time log: CI actions pinned by commit SHA, npm audit back on

Branch `ci/pin-actions-audit` from `origin/main` at `ee83059`, worktree
`.claude/worktrees/agent-a13ae2dea9b62487e`. An agent session (Claude Opus 5.5) on the
coordinator's brief for issue 16. Real clock (Helsinki), 2026-11-10: every time below is from
`date "+%H:%M"`.

- 11:55 worktree on the new branch; `npm run setup` started. Its node_modules copy hit the script's own 5-minute limit ("robocopy did not finish"); started again at about 12:01, where robocopy picks up what is already copied.
- 11:55 to 12:00 read `AGENTS.md`, issue 16, `.github/workflows/ci.yml` (the only workflow), `.github/dependabot.yml`, `.npmrc`. Resolved each tag with `gh api repos/<action>/git/ref/tags/<tag>`: all four are lightweight tags straight to a commit, so no dereferencing was needed. `git/matching-refs/tags/<tag>` gave the release tag on the same commit: checkout v7 = v7.0.1 `3d3c42e5…`, setup-node v7 = v7.1.0 `949feb24…`, cache v6 = v6.1.0 `55cc8345…`, upload-artifact v7 = v7.0.2 `cf430e03…`.
- 12:00 read Dependabot's `VersionCommenter` (dependabot-core, `github_actions/.../workflow_updater/version_commenter.rb`): for a SHA ref it takes the most specific version tags of the old SHA, keeps a comment that ends with one of them, and replaces that version with the new SHA's most specific tag. So the comment is the full release tag, `# v7.0.1`, not `# v7`.
- 12:01 `npm audit --audit-level=high`: exit 0. Ten moderate, all GHSA-g3hv-75wg-m249 (`minimatch` 7.0.0 to 11.0.0) through `@eslint/config-array`, eslint 10, `@eslint/js` and the `@typescript-eslint/*` packages; no low, high or critical. `npm audit --omit=dev`: 0. Same picture as the polish review's S12 (2026-11-08).
- 12:01 to 12:04 `ci.yml`: the four pins, and a "Dependency audit" step after `npm ci` with its own `timeout-minutes: 5`, inside the job's 20. `.npmrc` without `audit=false`. The header of `dependabot.yml`. Docs: `docs/security-overview.md` (supply chain: what we do, limits, show it), `docs/features/security.md` (a supply-chain paragraph, D95, files, tests), the README command table (the audit line), D95 in `docs/decisions.md`. Grepped `docs/` and `README.md` for `audit=false`, `@v7`, "major tag": the other hits are the dated polish review (`docs/reviews/polish-2026-11-08.md`), left as written.
- 12:04 setup's second run done (4 min 06 s; the copy finished in 1 min 04 s). `66aafcb`: `ci.yml`, `.npmrc`, `dependabot.yml`. Then the docs commit with this log.
