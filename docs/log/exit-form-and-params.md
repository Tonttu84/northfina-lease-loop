# Time log: the exit form posts once, every id route parses its params

Branch `fix/exit-form-and-params` from `main` f1a6f44. The coordinating session (Claude Fable),
from the polish review of 2026-11-08 (`docs/reviews/polish-2026-11-08.md`, bugs 4, 5 and security
findings 7 and 9).

| Time (Helsinki) | Step                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15:55           | Branch from `main`.                                                                                                                                                                                                                                                                                   |
| 15:56           | `exit-form.tsx`: a `sending` state around the POST and `Button pending`, so a second click cannot post the exit twice (the server refused the second and its refusal showed over an exit that went through); `pending` was only the refresh transition.                                               |
| 15:56           | `.max(100)` on `contractIdParamsSchema`, `exitParamsSchema`, `invoiceIdParamsSchema`, `quoteIdParamsSchema`, `assetIdParamsSchema` and `listInvoicesQuerySchema`; the five routes that took the raw `await params` now parse it with their schema (the pattern of `GET /api/applications/[id]`).      |
| 15:56           | `GET /api/quotes/[id]` and `GET /api/assets/[id]/passport` answer a constant 404 message instead of echoing the id. `npm run openapi`.                                                                                                                                                                |
| 15:57           | `src/app/api/id-params.routes.test.ts`: for the seven routes, an id of 101 characters is 400 `VALIDATION_ERROR`, one of 100 reaches the normal answer (401 anonymous, 404 public), the two 404 messages name no id. Green with the OpenAPI drift test and the authz route tests. `npm run check:all`. |

**Left undone:** the exit form's double submit has no automated test; the client components have
none (the review's testing section proposes Playwright for them). The other two existence leaks of
the review (bug 7: the decision and withdraw POSTs answer 403 where the GET answers 404) are left
as they are: D57 names the read only.
