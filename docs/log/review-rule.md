# Time log: every pull request is reviewed before it merges

Branch `chore/review-rule`. The coordinating session (Claude Fable), on Johannes's instruction
after the second-life texts port (PR 9). Real clock (Helsinki), 9 Nov 2026.

| Time (Helsinki) | Step                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07:55           | Rule 13 in `AGENTS.md`: a reviewer who did not write the change, a fresh agent session when no teammate is at hand, the verdict posted as a review on the pull request and in the PR body; rule 12 "Done means" extended. |
| 07:58           | PR opened, a fresh review session on it, CI.                                                                                                                                                                              |

**Chosen:** a rule in `AGENTS.md`, where the other working rules live and where every agent session
reads first, over a line in `docs/team-notes.md` (which describes how the hackathon was run, not
what binds now) or a decision row (the decisions file is about the product).

**Left undone:** nothing enforces it mechanically; a branch protection rule could require one
approving review, but a review by an agent session is not a GitHub review, so the PR body's
**Reviewed** line is the record.
