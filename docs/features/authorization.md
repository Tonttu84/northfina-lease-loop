# Authorization: who may do what, checked before the action

## What it does

One pure rule decides who may take each action on whose record, and every route that is not public asks it first, before it touches the record; the services ask again at their top, so a direct call without the route is refused too. A refusal is one family of codes: 401 for a visitor who has not picked who they are, 403 `FORBIDDEN` with the reason for everyone else, and nothing is written. Most routes ask before they read any body; `POST /api/contracts` and `POST /api/applications` read and validate the body first, because the record they act on (the application, the customer) is named in it, so an invalid body there is refused with 400 before the rule is asked.

## The rule

`can(actor, action, subject)`, in this order:

1. `run_demo_card` is allowed to everyone; its route answers 404 while the demo tools are off (D74), so it is open to every visitor while they are on; the runner acts as each card's own customer through the services, which check again.
2. A case awaiting the company's signatory (`awaiting_signatory`) is signed or decided only through the signing link by an e-mail with an active mandate on the day (`canSign`, D46); the coordinator and the admin are `signatory_required`.
3. `anonymous` (or an empty actor) is `not_signed_in`.
4. The admin may do everything else but sign: `sign_contract` is `customer_signs`, the customer signs their own lease (D88).
5. `decide_application`, `assess_asset`, `read_second_life` and `set_asset_status` are the admin's: a customer is `admin_only`.
6. A customer acts on its own records only: another customer's record, or one that belongs to no customer, is `not_owner`.
7. A company's account changes its own signatory list only while its e-mail is an active signatory (`signatory_required` otherwise; the admin checks the register instead, so this step never reaches the admin).

The first rule that answers decides. The actor × action table, every action of `AUTHZ_ACTIONS` in its order, as `src/domain/authz/policy.test.ts` pins it (owner = the record's customer, other = any other customer; no case awaiting a signatory, no signatory list in the subject):

| Action                 | anonymous     | owner      | other      | admin          |
| ---------------------- | ------------- | ---------- | ---------- | -------------- |
| `read_application`     | not_signed_in | ok         | not_owner  | ok             |
| `apply`                | not_signed_in | ok         | not_owner  | ok             |
| `decide_application`   | not_signed_in | admin_only | admin_only | ok             |
| `sign_contract`        | not_signed_in | ok         | not_owner  | customer_signs |
| `withdraw_application` | not_signed_in | ok         | not_owner  | ok             |
| `read_contract`        | not_signed_in | ok         | not_owner  | ok             |
| `pay_invoice`          | not_signed_in | ok         | not_owner  | ok             |
| `exit_contract`        | not_signed_in | ok         | not_owner  | ok             |
| `read_leases`          | not_signed_in | ok         | not_owner  | ok             |
| `manage_signatories`   | not_signed_in | ok         | not_owner  | ok             |
| `read_signatories`     | not_signed_in | ok         | not_owner  | ok             |
| `assess_asset`         | not_signed_in | admin_only | admin_only | ok             |
| `read_second_life`     | not_signed_in | admin_only | admin_only | ok             |
| `set_asset_status`     | not_signed_in | admin_only | admin_only | ok             |
| `run_demo_card`        | ok            | ok         | ok         | ok             |
| `read_account`         | not_signed_in | ok         | not_owner  | ok             |

With a case awaiting the company's signatory (rule 2), `sign_contract` and `decide_application` are `signatory_required` for every actor, the admin and anonymous included, unless the subject names an e-mail with an active mandate on the day (at a route, `authorize` refuses anonymous before it reads the record, so anonymous gets 401 `not_signed_in` there); with the company's signatory list in the subject (rule 7), `manage_signatories` is `signatory_required` for the owner whose e-mail holds no active mandate.

Worked example, card 6: Norvi's coordinator (`cust-norvi`) applies for one `ebike-004` (15 144 a month) and the case waits for the signatory. `POST /api/contracts` as `cust-norvi` and as `admin` both answer 403 `FORBIDDEN` with `{ code: 'signatory_required', params: { action: 'sign_contract' } }`; with no actor picked it is 401 `not_signed_in`. Only the link the demo outbox shows to the admin signs it, as the named signatory.

HTTP (D74): `not_signed_in` → 401, every other refusal → 403, both `FORBIDDEN` through `fail()` with the reason as details. An unknown record keeps the route's own 404; another customer reading an application gets the same 404 as an unknown id (D57). The application page shows the signing-token link to the admin only (wave 3 review finding 1).

Public, with no `authorize`: the catalogue, the price preview and the stored quotes, the passport, the audit log and its check, the actor picker (a demo tool since D93), the demo clock, the signing link (the token is the signatory's authority) and the sign-in routes (`POST /api/login`, nobody to authorize yet; `/api/login/[token]`, the token is the visitor's authority, D93). `tests/meta-rules.test.ts` lists them and fails on any other `route.ts` that never calls `authorize(`.

**Since D93:** `read_account` (one's own account, the back office's for the admin), the account page.

**Since D87 and D88:** `withdraw_application` (the owner and the admin) and `sign_contract` refused to the admin with the code `customer_signs`: the customer signs their own lease.

## Decisions

- D73: one pure policy, checked before the action in the route and again at the service's top.
- D74: the HTTP mapping (401 / 403 `FORBIDDEN`) and the `DEMO_TOOLS` switch on the card runner, the demo clock's route and its cookie ([security.md](security.md)).
- D85: the second-life page is back office: `read_second_life` is the admin's, because the page shows the whole waiting list (other customers' budgets and needs); its links show for the admin only.
- Builds on D17 (the actor cookie, set by the "continue as" picker while the demo tools are on or by the sign-in link, D93), D46 (the signing link, the mandate list), D47 (the admin applies on behalf), D57 (another customer's application reads as not found).

## Pure functions

- `can(actor: string, action: AuthzAction, subject: AuthzSubject) → { ok: true } | { ok: false, reason: { code, params: { action } } }`. `subject` is `{ customerId: string | null, awaitingSignatory?, mandates?, signerEmail?, onDate? }`: only what a rule needs.
- `isAuthzRefusal(reason) → boolean`: whether a service's refusal is one of the five codes (`not_signed_in`, `not_owner`, `admin_only`, `signatory_required`, `customer_signs`).

The server side, not pure: `authorize(db, actor, action, ref)` with `ref` one of `{ application }`, `{ contract }`, `{ invoice }`, `{ customer }`, `{ none: true }` reads only the owner through the owning slice (`applicationOwner`, `contractCustomerId`, `invoiceCustomerId`, `getCustomer`), refuses anonymous before any read, and answers `{ ok: true, ownerId }`, the refusal, or `not_found`. `forbiddenResponse(reason)` and `refusalResponse(reason, notFound)` turn it into the envelope.

## Files

- `src/domain/authz/policy.ts`, `policy.test.ts`: the rule and the actor × action table.
- `src/server/authorize.ts`, `authorize.test.ts`: the owner read and the HTTP mapping.
- `src/server/demo-tools.ts`, `demo-tools.test.ts`: the `DEMO_TOOLS` switch.
- The routes under `src/app/api/` (every write and private read), the tops of `signContract`, `exitContract`, `decideApplication`, `createApplication`, `withdrawApplication`, `payInvoice`, `addSignatory`, `revokeSignatory`, `assessAsset`, `changeAssetStatus`.
- The pages `applications/[id]` (and its signing outbox), `contracts/[id]`, `leases` and `customers/[id]` (`read_leases`), `customers/[id]/signatories`, `account` (`read_account`), `assets/[id]/second-life` (through `src/server/second-life-page.ts`, D85).
- `src/components/authz-refusal.ts`: the message key of a refusal; the `authz.refusal.*` keys in the four message files.

## Tests that pin the numbers

- `src/domain/authz/policy.test.ts`: every actor kind × every action, card 6's signatory rows, the mandate on the company's own list.
- `src/app/api/authz.routes.test.ts`: every write route posted as anonymous (401), the wrong customer (403) and the admin, the audit row count unchanged on a refusal.
- `src/server/authorize.test.ts`: owner reads, `not_found`, anonymous refused before the read, card 6.
- `src/server/second-life-page.test.ts`: D85, a customer, an unknown actor and anonymous get the refusal and no waiting-list data; the admin gets card 9's preview.
- `src/app/api/demo/cards/[id]/run/route.test.ts`: 404 with the demo tools off.
- `tests/meta-rules.test.ts`: every non-public `route.ts` calls `authorize(`.

## Open questions

- `decideByToken` keeps its own `signingCheck` (it also brings a waiting entry into force on its first opening, which `canSign` does not); the policy's mandate path mirrors it rather than replacing it.
- While the demo tools are on (D74) anyone can still pick "Admin" in the picker, by design; with them off only the back office account's sign-in link sets that actor (D93).
