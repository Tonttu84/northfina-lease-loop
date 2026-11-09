# Time log: Dependabot skips the TypeScript and @types/node majors

Branch `chore/dependabot-ignore-majors`. The coordinating session (Claude Fable), on Johannes's
note that Dependabot's PR 8 fails CI. Real clock (Helsinki), 9 Nov 2026.

| Time (Helsinki) | Step                                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09:25           | Read PR 8's log: `npm ci` fails with ERESOLVE, TypeScript 7.0.2 against typescript-eslint 8.72.1's peer range `>=4.8.4 <6.1.0`. PR 7 (closed by Dependabot when it regrouped) failed the same way. @types/node 26 would outrun the Node in `.nvmrc`. |
| 09:30           | `.github/dependabot.yml`: `ignore` for the majors of `typescript` and `@types/node`, with the reason beside each. This log. One commit, this PR; then `@dependabot recreate` on PR 8 so it carries only Playwright 1.65.0 and Vite 8.3.6.            |

**Chosen:** an ignore rule over merging PR 8 with `--legacy-peer-deps` (a broken resolution the
lint would then run on) or pinning typescript-eslint to a prerelease. The two minors still arrive.

**Left undone:** lifting the TypeScript rule when typescript-eslint accepts a newer major; the
`@types/node` rule stays until `.nvmrc` moves.
