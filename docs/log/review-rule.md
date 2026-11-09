# Time log: every pull request is reviewed before it merges

Branch `chore/review-rule`. The coordinating session (Claude Fable), on Johannes's instruction
after the second-life texts port (PR 9). Real clock (Helsinki), 9 Nov 2026.

| Time (Helsinki) | Step                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 08:50           | `369bf6f`. Rule 13 in `AGENTS.md`: a reviewer who did not write the change, a fresh agent session when no teammate is at hand, the verdict in the PR body; rule 12 "Done means" extended; this log.         |
| 08:52           | `220711b`. The verdict is posted on the pull request as a GitHub review too, so GitHub tracks that a review happened.                                                                                       |
| 08:54           | PR 10 opened, CI green twice, a fresh review session on it: fix first. Its findings fixed here: this log on the real clock, the "Left undone" below, the rule's example and its third sentence, the README. |

**Chosen:** a rule in `AGENTS.md`, where the other working rules live and where every agent session
reads first, over a line in `docs/team-notes.md` (which describes how the hackathon was run, not
what binds now) or a decision row (the decisions file is about the product).

**Left undone:** nothing enforces it mechanically. A branch protection rule requiring one approving
review would not fit a solo pull request: its review is posted from the author's own account as a
comment, which GitHub does not count as an approval. The review on the pull request and the
**Reviewed** line in the PR body are the record.
