# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-27 (owner requirements clarified and missing findings added; prior 2026-09-26 fixes remain recorded below)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`, `docs/docker.md`, `README.md`, `docs/tmp-xx.md`
**Method:** 5 parallel sub-agent audits — (1) re-verify prior open items, (2) spec vs implementation, (3) backend correctness, (4) frontend correctness, (5) security / data / tests / DevOps. Every finding below was re-checked by file reads. Evidence format `path:line`.

**2026-09-27 follow-up:** Read-only frontend → API → storage tracing, targeted unit/web tests, and direct owner clarification. No agents were used for this follow-up; database integration tests and the live deployment were not rerun. Section 1 records the confirmed requirements, not implemented behavior. The old single-branch, permission, and single-drawer specification needs updating to match these decisions (DOC-REQ).

> How to use this doc: fix in priority order in §10. Only open problems are listed. Check off (delete the row/section) as you go.

---

## Table of contents

- [Fix tracker](#fix-tracker)
- [0. Executive summary](#0-executive-summary)
- [1. Owner-confirmed requirements and gaps](#1-owner-confirmed-requirements-and-gaps)
- [2. Spec vs implementation gaps](#2-spec-vs-implementation-gaps)
- [3. Backend — wrong logic / mismatches](#3-backend--wrong-logic--mismatches)
- [4. Frontend audit](#4-frontend-audit)
- [5. Security](#5-security)
- [6. Data integrity / concurrency](#6-data-integrity--concurrency)
- [7. Missing tests](#7-missing-tests)
- [8. DevOps / config gaps](#8-devops--config-gaps)
- [9. Forgotten edge cases](#9-forgotten-edge-cases)
- [10. Priority fix order](#10-priority-fix-order)
- [Appendix A. What is solid](#appendix-a-what-is-solid)
- [Appendix B. Verification matrix (frontend → backend match)](#appendix-b-verification-matrix-frontend--backend-match)

---

## Fix tracker

Only ❌ Open items. ✅ Fixed and ➖ No-action rows were removed after re-verification.

| ID         | Problem                                                                                            | State   | Evidence / note                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W2 + E5    | Internal POS `recipe`/`item` sales unrestored; refunds still branch those types                    | ❌ Open | Spec §7/§10 (2026-09-19). Sales always `type:"external_product"` (`orders.service.ts:185`, `orders.schemas.ts:15-56`). Refunds still validate all three (`refunds.service.ts:169-189`)           |
| §2.2       | POS two-level nav missing (internal main/sub + flat external)                                      | ❌ Open | `pos/page.tsx:357-375` flat external chips; `pos-model.ts:202-216`; `ExternalCategory` (`packages/shared/src/types.ts:480-489`) has no `parentId`                                                |
| §2.9       | Recipe products + live cost-%/margin UI missing (cycle/yield/prepare exist)                        | ❌ Open | API create is `type:"prepared"` only (`recipes.schemas.ts:34`). `RecipeMargin` unused (`recipe-controls.tsx:133-152`). Cycle guard present (`recipes.service.ts:376-415`, `recipes.test.ts:281`) |
| DATA-1     | Concurrent refunds of the same line can over-refund under REPEATABLE READ                          | ❌ Open | Snapshot starts at non-locking `findByClientRequestId` (`refunds.repository.ts:130-139`); later `refundedQuantities` is a non-locking `SUM` (`:92-102`)                                          |
| B5         | Multi-item waste locks in catalog order with no deadlock retry                                     | ❌ Open | `waste.service.ts:196-211`; no `transactionWithDeadlockRetry`. Sales lock items by id (`orders.repository.ts` lock path)                                                                         |
| B6         | Waste “recipe” catalog lists prepared recipes and deducts their formula                            | ❌ Open | `waste.repository.ts:167-197`; `loadRecipeProduct` (`:98-128`) has no `type='product'` filter; only prepared recipes exist                                                                       |
| B7         | Daily/hourly pay types exist in spec/DB; payday is monthly-only                                    | ❌ Open | Spec §9; `schema.ts:26`; create monthly-only (`employees.schemas.ts:42`); payday 409 (`salaries.service.ts:28-29`); UI wipes daily/hourly on save (`employee-modal.tsx:107-124`)                 |
| W1         | Single open shift system-wide; owner requires concurrent shifts with one per cashier account       | ❌ Open | Decision resolved 2026-09-27; see §1.6. Unique `openSlot` `schema.ts:834,848`; existing race test pins obsolete single-drawer behavior.                                                          |
| §2.12      | PDF export uses browser print only                                                                 | ❌ Open | `reports/page.tsx:357` `window.print()`; salary cash-flow and employee history exist                                                                                                             |
| AUTH-1     | Cashier permissions and admin restrictions conflict with confirmed access                          | ❌ Open | `apps/web/src/lib/navigation.ts:9,10,12,18`; `apps/api/src/app.ts:72-75`; cashier-only sales/refunds/shift routes. See §1.1.                                                                     |
| BRANCH-1   | Independent branch workspaces and cashier branch assignment absent                                 | ❌ Open | `apps/api/src/db/schema.ts` has no branch entity/ownership; `docs/system-specs.md:5,19` still specifies one branch. See §1.2.                                                                    |
| CRUD-1     | Full transaction CRUD with reversal and retained history absent                                    | ❌ Open | Orders/purchases/refunds/waste/expenses routers lack transaction update/delete routes; online orders are GET-only. See §1.3.                                                                     |
| ONLINE-1   | Immediate, branch-controlled online stock deduction absent                                         | ❌ Open | `cache-refresh.service.ts:4,110`: 12-hour summary import; `external-orders.client.ts:48,177` retains quantity count only. See §1.4.                                                              |
| ONLINE-2   | Online order updates remain frozen after first import                                              | ❌ Open | `external-orders.repository.ts:15,37` inserts unseen rows; duplicate update changes no stored values. See §1.4.                                                                                  |
| ONLINE-3   | Branch-local online CRUD, backend-priority reconciliation, and cancellation stock decisions absent | ❌ Open | `orders.router.ts:7` exposes GET `/external`; cached summaries have no branch processing/reversal history. See §1.3–1.4.                                                                         |
| RECIPE-1   | Imported-product setup cannot reference a reusable live recipe                                     | ❌ Open | UI `product-stock-setup-modal.tsx:17,330`; input `products.schemas.ts:12`; mappings `schema.ts:632,655,678` reference items only. See §1.5.                                                      |
| SHIFT-UI   | Home/POS shift actions redirect to a page excluded from cashier access                             | ❌ Open | `components/home/shift-tape.tsx:116`; `app/pos/page.tsx:338` link to `/shifts`. Required direct controls: §1.6.                                                                                  |
| SHIFT-HIST | Shift history retrieval stops at 100 records without pagination                                    | ❌ Open | `shifts.repository.ts:144-152`; older shifts are stored but not reachable through this list.                                                                                                     |
| REPORT-1   | Basic reports do not cover all flows or distinguish global online sales from branch deductions     | ❌ Open | `reports.service.ts:84-157`; `reports.repository.ts` reads local sales only; transfers/preparations appear in ledger without dedicated flow reports. See §1.7.                                   |
| REPORT-2   | Printed date range can label stale report figures                                                  | ❌ Open | `app/reports/page.tsx:332,372,417`: loaded data and editable dates are separate; print uses input dates.                                                                                         |
| REPORT-3   | Shift sales use lifetime totals rather than transactions within the selected dates                 | ❌ Open | `reports.repository.ts:111-120` filters shift opening date only; joined orders/refund sums are not range-limited.                                                                                |
| REPORT-4   | Negative stock omitted from alerts when minimum level is zero                                      | ❌ Open | `reports.service.ts:61-64` requires `minimumLevel > 0`; UI calls this the low-and-negative stock list.                                                                                           |
| REPORT-5   | Profit and snapshot labels do not clearly describe their scope                                     | ❌ Open | `reports.service.ts:55` computes gross profit; `app/reports/page.tsx:50` says profit. `stock()`/`suppliers()` use current/all-time data. See §1.7.                                               |
| DOC-REQ    | Written specification still contradicts owner-confirmed branch, role, and shift requirements       | ❌ Open | `docs/system-specs.md` scope/permission matrix/§8; revise affected specifications and obsolete acceptance tests alongside implementation.                                                        |

Removed 2026-09-26 (tier 3 of the §10 order, fixed with TDD): B4 — the employees report no longer measures `TIMESTAMPDIFF(opened_at, closed_at)`. It builds the same open segments the shift screen already walks: each `open`/`reopen` event starts a segment that ends at the next `close`/`admin_close` (or `closed_at`/now), clipped to the report range, so the overnight gap after an admin reopen is no longer paid as work (`reports.repository.ts` `employees`; `tests/db/reports.test.ts` asserts 180 minutes for a 2h + 1h pair, and that the report agrees with `GET /api/shifts` for the same shift). B8 — a fully discounted (zero-cash) sale can now be refunded and restocked: the service rejects only a negative amount instead of `<= 0`, and `refunds_amount_positive_chk` became `amount >= 0` (`schema.ts`; migration `0038_allow_zero_refund_amount.sql`). The over-refund guard on remaining cash is unchanged, so real over-refunds still 409 (`tests/db/refunds.test.ts` asserts a 0.00 refund with a `refund_return` movement and no waste; `tests/refunds/refunds.service.test.ts` "409s a zero-value refund" was inverted into "allows a zero-cash refund for a fully discounted order"). §7.5,§7.3 — concurrent same-`clientRequestId` double-submit is now pinned for purchases and refunds: both requests return 201 with one id and exactly one document, batch and stock movement (`tests/db/purchases.test.ts`, `tests/db/refunds.test.ts`). The existing `ER_DUP_ENTRY` replay path held, so these are characterisation tests; they were mutation-checked by removing the replay branch (refunds → 500, purchases → 409) and confirming both tests fail.

Removed 2026-09-26 (tier 1–2 of the §10 order, fixed with TDD): F4 — reports print Arabic for salary payment/advance, stocktake shortage/surplus, purchase-invoice/preparation/transfer/stocktake references, stocktake document kind, salary-history type, and waste reasons; `Column.labelSet` selects the vocabulary so a stocktake reference and a stocktake kind do not collide, and free-typed refund reasons stay untouched (`report-table.tsx`, `reports-model.ts`, `reports/page.tsx`; `tests/components/reports/report-table.test.tsx` 15 tests). F8 — the stocktake confirm reason is its own field, so the optional start note can no longer stand in for it (`stocktake-model.ts` `confirmReasonFor`, `stocktakes/page.tsx`). B3 — low stock now requires `minimumLevel > 0` in one shared `isLowStock` helper used by both the dashboard and the report, matching the items list (`reports.service.ts`; `tests/reports/reports.service.test.ts`). B2 — surplus falls back to the newest batch of any remaining quantity instead of cost 0, while stocked shelves keep the oldest in-stock batch (FIFO preserved by a regression test) (`stocktakes.repository.ts` `currentFifoCost`; `tests/db/stocktakes.test.ts`). §7.2 — cashier 403s on purchases/suppliers and admin 200s pinned (`tests/db/auth.test.ts`).

Removed 2026-09-26 (tier 3 of the §10 order, fixed with TDD): B1 — `salesByCategory` unions the local recipe/item grouping with `order_lines.external_product_id → external_products → external_categories`, so live external sales and their refunds appear under the external category name in both the main and sub columns, matching how a top-level local category already renders (`reports.repository.ts`; `tests/db/reports.test.ts` sells and refunds an external product and expects the category row with sales/cost/refund totals).

Removed 2026-09-24 (fixed after CodeRabbit review, not previously tracker rows): payday rejects a month on or before the latest paid month and lists it as not payable (`salaries.service.ts`); salary arithmetic uses integer cents; `migrate`/`cache-worker` healthchecks run `scripts/process-liveness.cjs` so the probe cannot match itself.
Removed 2026-09-24 (fixed, deleted from report): DOC-TMP — `docs/tmp-xx.md` reticked against current code (monthly salaries, report feeds, POS/recipes/waste/PDF marked partial where unrestored; stocktake blank counts documented). F2 — blank stocktake counts no longer coerce to 0 (`countedLinesFromDraft` in `stocktake-model.ts`, wired in `stocktakes/page.tsx`; empty/whitespace quantity rejected in `stocktakes.schemas.ts`). F5 — POS size buttons use `catalogSizePrice` so they match the discounted tile/cart (`pos-model.ts`, `pos/page.tsx`).
Removed 2026-09-24 (spec-aligned, deleted from report): §4 offline — spec §2 requires internet at the shop (`system-specs.md:15`); API throw + POS banner only (`api.ts:29-31`, `pos/page.tsx:312-319`). E7 low-stock push/job — spec §4 asks for dashboard + items-list flags only; those flags exist.
Removed 2026-09-24 (implemented, dropped from §2.9 remaining list): recipe cycle guard (`recipes.service.ts:376-415`, `tests/db/recipes.test.ts:281`).
Removed 2026-09-21 (verified fixed, deleted from report): C1, C2, §2.1, §2.3, §2.10, W3, W4, M1, M1b, M2, §4 RTL padding, §4 cart math, §4 refund draft, §4 refund updater, §4 admin notice, §4 shift polling, §4 waste feedback, §4 receipt RTL, §4 expense order, §4 transfer hint, §4 report dates, S4, S6, D5, E1b, E2, §2.14-3, §2.12-group-2 (stocktake history).
Removed 2026-09-22 (verified fixed, deleted from report): §2.8 salaries/payday, §2.12 groups 3–4 salary reporting, §2.13 salary tables, §4.1 salaries placeholder.
Removed 2026-09-22 (test added, deleted from report): D4-partial — transfers deadlock-retry case now in `apps/api/tests/lib/deadlock-retry.test.ts`; wrapper covered for all 5 wrapped services (categories/orders/purchases/refunds/transfers).
Removed 2026-09-22 (closed, deleted from report): §8 — migrate/cache-worker healthchecks added (`/proc` probes, documented in docker.md Status and health); `NEXT_PUBLIC_API_URL` rebuild coupling documented and accepted in docker.md.
Removed 2026-09-21 (no-action / skipped per owner or intent, deleted from report): §2.14-4, M4, §4 table captions, §7.9, plus previously removed false positives (D1, D3, D6/D7, S1/S2/S5, N1–N5, E3/E4/E6/E1c, old C1–C4, §2.11 refund→waste).
Removed 2026-09-21 (pin tests added, later files removed): M3-pin, S3-pin, §2.14-1-pin — the cited files under `apps/web/tests/shared/` are gone; the behaviors they described remain in code. Do not treat the missing pin files as product regressions.

---

## 0. Executive summary

Biggest verified remaining risks, most severe first (note this is **not** the §10 order, which is by effort):

- Two overlapping refunds of the same line can both pass the already-refunded check under MySQL REPEATABLE READ, paying cash twice and returning stock twice (DATA-1).
- Internal POS sales from the 2026-09-19 spec are still unrestored. The counter sells only `external_product` lines (W2 + E5, §2.2, §2.9).
- Owner-confirmed requirements are not met end-to-end: branch isolation, full permissions/transaction CRUD, immediate online stock processing, reusable recipe links, concurrent cashier shifts, and basic reporting of every business flow (§1). The presence of pages or six report tabs does not establish complete coverage.

Severity and effort do not line up: DATA-1 is the worst bug here but sits in tier 4 of §10, while the tier 1–3 items are cosmetic or one-query changes and are all now done; tier 3 closed B4 (worked hours), B8 (zero-cash refund) and the concurrent same-key replay gap.

Previously closed money bugs (duplicate invoice 409, external refund restock, idempotency, deadlock retry, stacked discounts, salaries module, stocktake module) still hold.

---

## 1. Owner-confirmed requirements and gaps

Confirmed directly with the owner on 2026-09-27. These requirements supersede conflicting older assumptions. They are implementation work, not completed fixes. Preserve existing unrelated findings and fix history.

### 1.1 Permissions (AUTH-1)

- Cashier has full create/read/update/delete permissions in exactly these areas: **Home, POS, Orders (cashier and online tabs), Cafe, Suppliers, Purchases, Expenses, Waste, Refunds, Recipes**. Full access includes supplier/payment operations, purchase recording, product stock configuration, and recipe preparation in those areas.
- The separate Shifts page is excluded from cashier access; open/close controls belong in Home and POS (§1.6). Other unlisted pages remain excluded, including users, employees, payroll, reports, categories, main warehouse, and stocktakes.
- Admin has full access to every branch and all features. Current cashier-only transaction restrictions are not the target admin permission model.
- Implement the same rules in navigation, direct-page access, APIs, and branch ownership checks. Permission to use a page must not expose another branch's records.
- **Current state: partial.** Suppliers, Purchases, and Recipes are admin-only in navigation and API mounts (`navigation.ts:9,10,18`; `app.ts:72-75`). Shifts is currently cashier-visible (`navigation.ts:12`). Expense-category and product-configuration writes also retain admin gates. Existing cashier-403 tests document the old permissions, not acceptance of the new requirements.

### 1.2 Branch workspaces (BRANCH-1)

- Each branch is an independent workspace with its own operational data and configuration: employees, payroll, stock, products, recipes/mappings, suppliers, purchases/payments, orders, shifts, expenses, waste, refunds, preparations, transfers, and reports.
- Admin assigns each cashier to **exactly one branch**. Cashier actions affect only that branch; admin can access all branches.
- Apply branch ownership throughout storage, relations, queries, mutations, histories, reports, and background processing. Enforce it server-side, including direct requests for IDs belonging to another branch.
- The same imported online order can intentionally produce stock deductions in several branches (§1.4). Its source identity is shared; branch operational records and effects remain separate.
- **Current state: absent.** No branch entity, cashier assignment, or branch-scoped operational model exists. Existing warehouses are the single `main`/`cafe` pair. This work requires adapting every existing flow, not merely adding a branch selector.

### 1.3 Full CRUD and correction history (CRUD-1, ONLINE-3)

- Full CRUD applies to the allowed areas, including both Orders tabs. Editing/deleting completed transactions must reverse their original stock/cash effects and keep the original record and change history. Edits then apply the corrected effects; repeated requests must not repeat reversals or applications.
- Reconcile dependent totals and records, including inventory quantities/costs, supplier balances, shift cash, waste/refunds, and reports. Retained history must make corrections distinguishable from the original transaction.
- Online-order create/edit/delete operations affect **local records only**, never write changes to the connected backend. A cashier's local online-order modifications affect only their branch.
- If the backend later changes that order, the backend version takes priority: reverse the branch-local modifications, apply the changed backend version, and retain history. Repeated imports of the same version must be harmless. Cancellation stock handling remains a staff decision (§1.4).
- **Current state: absent for the complete requested flow.** Orders, purchases, refunds, waste, and expenses lack transaction update/delete endpoints. The Online Orders tab only reads cached summaries. Existing supplier/recipe editing does not establish transaction correction support across the system.

### 1.4 Online order stock processing and synchronization (ONLINE-1/2/3)

- New online orders must appear and trigger eligible stock deductions **immediately**, rather than waiting for a scheduled batch import. Deduction happens on arrival; reported sales recognition happens on completion (§1.7).
- Admin enables/disables deduction **per branch**. Only orders placed after that branch's enable/re-enable point qualify. Orders predating activation or placed while disabled must not be deducted later as a backlog.
- Deduct once in **every enabled eligible branch**. One order with Branch A and Branch B enabled intentionally creates two deductions, one from each branch. Deduplication is by external order and branch, with tracked versions/corrections; a global already-processed flag is insufficient.
- Use each branch's own configured product/size/modifier ingredients or linked recipes. Persist processing state, ingredient quantities, costs, and stock movements so re-imports, retries, concurrent processing, and worker restarts cannot duplicate effects.
- Missing configuration in a branch means **pending deduction + visible alert + automatic retry after configuration**. One branch's missing mapping must not prevent another eligible branch's processing. A configured product with insufficient stock still deducts and flags negative stock, like POS.
- If cancelled after deduction, **staff decide return to stock or record waste** for the affected branch. Do not automatically restore ingredients. Record the decision and effects; duplicate handling must not repeat them. Cancellation excludes the sale from online revenue separately from this stock decision.
- Existing online orders must update their backend status/amount/content when the source changes, with the local correction behavior in §1.3.
- **Current state: deduction absent; display/import partial.** `cache-refresh.service.ts:4,101,110` refreshes catalog/order summaries every 12 hours. `external-orders.client.ts:48,177` reduces order lines to item count, without a retained line definition usable for stock deductions. `external-orders.repository.ts:37` makes duplicate imports a no-op, freezing statuses and amounts. `schema.ts:716` contains a summary cache, not a branch/version stock-processing ledger.
- **Integration dependency to verify during implementation:** immediate delivery of new/changed orders and complete product/size/modifier line data from the backend. The current integration only reads summary endpoints; the existing cache alone cannot meet these requirements.

### 1.5 Reusable recipes for imported products (RECIPE-1)

- Products for this configuration flow come from the online catalog. Allow selecting a saved recipe **R1** for a product/size/modifier stock target instead of repeatedly entering its individual **P1/P2/P3** ingredients.
- Keep a live link: editing R1 updates all connected product configurations for **future deductions**. A different formula requires a separate recipe R2/R3.
- Already processed orders are finished: keep their original ingredient quantities and costs. Later recipe edits must not rewrite old stock movements, sales, cancellation returns, or correction history.
- **Current state: absent.** UI and API accept `itemId + quantity` lists only (`product-stock-setup-modal.tsx:17,330`; `products.schemas.ts:12`; `schema.ts:632,655,678`). Prepared recipes can produce a stocked output item, but that is a separate preparation flow, not selecting R1 and expanding its ingredients at sale/deduction time. This requirement is separate from the older internal-POS restoration item W2.

### 1.6 Concurrent shifts and accessible history (W1, SHIFT-UI, SHIFT-HIST)

- Support 2, 3, 4, 5, etc. simultaneously open shifts for different cashiers, in the same branch or different branches. Enforce **one open shift per cashier account**, not one for the entire system.
- Store separate cashier/branch records, opening float, sales, refunds, expenses, actual/expected cash, over/short, worked time, and event history for every shift. Actions must attach to the correct cashier's shift in the correct branch.
- Cashiers open/close shifts directly from **both Home and POS**, without access to the separate Shifts page. Admin retains full access to shift administration/history.
- Keep all successive shift history reachable; the current latest-100 list needs pagination or equivalent retrieval, not deletion of older records.
- **Current state: partial.** Successive shifts and events are stored, but `schema.ts:848` enforces one open slot system-wide; current-shift and transaction lookups assume this singleton. Home/POS links redirect to `/shifts` (`shift-tape.tsx:116`; `pos/page.tsx:338`). The history API stops at 100 (`shifts.repository.ts:152`).

### 1.7 Basic informative reporting of every flow (REPORT-1 through REPORT-5)

- Owner requires **basic, informative operational reports covering every business flow**. Cover sales (POS and online), discounts, stock/value/movements, transfers, recipe preparation, purchases/suppliers/payments, expenses, waste, refunds, employee/payroll activity, and shifts, with relevant dates, quantities, amounts, costs, status, and responsible staff. Apply branch boundaries and clear date semantics.
- Count an online sale **once across the system**, using the backend's amount and status. Recognize only **completed** online orders; cancelled orders are excluded. Show each branch's own stock deduction/cost and branch-local changes separately. Never multiply online revenue by the number of branches that consumed stock.
- The six existing report tabs are a foundation, not full coverage. Current queries read local POS transactions, not online sales; transfers/preparations appear as movements but have no dedicated basic flow report. Branch reporting and the new correction histories are absent.
- **REPORT-2 — printed range:** `reports/page.tsx:332,372,417` permits new input dates to label old loaded data. Display/print the loaded report's actual range; refresh failures or pending requests must not allow old figures to masquerade as a new period.
- **REPORT-3 — shift range:** `reports.repository.ts:111-120` selects shifts by opening time, then sums lifetime transactions. Period totals must count transactions within the requested period, including overnight/reopened shifts, with lifetime shift reconciliation clearly distinguished.
- **REPORT-4 — negative alerts:** `reports.service.ts:61-64` requires a positive minimum. Keep the no-minimum low-stock behavior, but independently include negative quantities even when the minimum is zero.
- **REPORT-5 — labels:** current profit is **gross profit** (`sales - refunds - cost + returned cost`), not profit after payroll/operating expenses/waste. Label it accurately. Current stock and all-time supplier balances are snapshots, not historical balances for the selected report period; make that scope explicit.
- Advanced accounting, a new net-profit calculation, historical balance reconstruction, and a comprehensive permission-change audit report were not confirmed as additions. The older PDF item remains tracked separately (§2.12); the owner's basic-report answer did not resolve it.

---

## 2. Spec vs implementation gaps

Source: `docs/system-specs.md`, `docs/docker.md`, `README.md` vs `apps/api/src`, `apps/web/src`, `packages/shared/src`.

| #    | Spec module (§)                        | Status                                                                         |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------ |
| §3   | Categories (main → sub tree)           | ⚠️ Partial — local tree OK; POS two-level nav lost                             |
| §7   | POS three line types                   | ⚠️ Gap — external catalog only                                                 |
| §9b  | Salaries / advances / bonuses / payday | ⚠️ Partial — monthly implemented; daily/hourly unrestored (B7)                 |
| §10  | Recipes (prepared/sub-recipes)         | ⚠️ Partial — prepared flow works; product recipes unrestored                   |
| §11  | Waste                                  | ⚠️ Partial — item + external work; recipe path hits prepared (B6)              |
| §14b | Reports (6 groups)                     | ⚠️ Partial — local coverage exists; missing flows and correctness gaps in §1.7 |
| §14c | PDF export                             | ⚠️ Partial — browser print-to-PDF only                                         |
| §15  | Data model                             | ✅ Implemented                                                                 |

The earlier verification covered the old single-branch specification. It does not establish compliance with the owner requirements in §1: roles, branch ownership, full CRUD, online stock processing, shifts, and report coverage need work. Current admin POS checkout is blocked (`requireRole("cashier")` + POS banner), which conflicts with full admin access; cashier report-page exclusion remains intended.

### 2.2 Categories (§3) — ⚠️ Partial

- ✅ Local tree + admin CRUD: `schema.ts:129-139` (`parentId`), `categories.router.ts`.
- ❌ POS two-level nav missing. POS renders a flat external list `apps/web/src/app/pos/page.tsx:357-375` with single-equality filter (`models/pos-model.ts:202-216`). `ExternalCategory` (`packages/shared/src/types.ts:480-489`) has no `parentId`. Reports UI still shows main/sub columns (`reports/page.tsx:67-76`); live external sales now appear there under their external category.
- **Fix:** restore internal main/sub tabs plus the flat external group, or amend spec §3/§7.

### 2.8 Employees and payroll (§9) ⚠️ Partial

- ✅ CRUD + grant/revoke (`employees.router.ts`, `employees.service.ts:55-118`).
- ✅ Monthly payroll: `salaryAdvances`, `salaryAdjustments`, `salaryPayments` in `schema.ts` plus migration `0037_worried_moira_mactaggert.sql`.
- ✅ Admin APIs `/api/salaries`; UI `apps/web/src/app/salaries/page.tsx`.
- ✅ Salary payments and advances feed cash-flow; payments/advances/adjustments feed employee history (`reports.repository.ts` `cashFlow`, `salaryHistory`).
- ❌ Daily/hourly: spec §9 still lists those pay types. Create schema is monthly-only (`employees.schemas.ts:42`). Payday 409s unless monthly (`salaries.service.ts:28-29`). The employee form offers monthly and clears daily/hourly on save (`employee-modal.tsx:107-124`). See B7.

### 2.9 Recipes (§10) ⚠️ Partial

Prepared/sub work: `POST /:id/prepare` (`recipes.router.ts:14`), FIFO preview, immutable `preparations` + allocations. Present: yield scaling (`recipes.service.ts:170-180`), atomicity via `repo.transaction` (`:136`), deactivation guards, cycle reject (`:376-415`, test `recipes.test.ts:281`). Past preparations store name/cost snapshots, so later edits leave history alone.

Still missing vs spec §10:

- Sellable `recipes.type='product'` with size selling prices. Create input is `type: z.literal("prepared")` (`recipes.schemas.ts:30-38`); service 404s `type === "product"`.
- Live cost-% / margin next to selling price. `RecipeMargin` exists (`recipe-controls.tsx:133-152`) and is only used by an isolated component test. The recipes page shows FIFO unit cost for prepared recipes (`recipes/page.tsx:387-407`). The “products” tab is the external catalog (`recipes/page.tsx:249-272`).

### 2.12 Reports/dashboard/PDF (§14+§2)

- ✅ Dashboard: local POS sales/refunds/discounts/gross profit/orders, single open shift, configured low-stock alerts, pending transfers (`reports.service.ts:61-79`, `reports.repository.ts:15-22`). Negative items with a zero minimum are missed (REPORT-4).
- ⚠️ Groups 1 (by day/product/shift/cashier), 5 (waste&refunds), 6 (suppliers) return local data; group 2 stocktake history exists. Date selection exists, but shift totals and print labels need fixing (REPORT-2/3); current stock/supplier summaries are snapshots (REPORT-5).
- ✅ Group 3 includes salary payments and advances in cash-flow; group 4 includes salary history (`reports.repository.ts` `cashFlow`, `salaryHistory`).
- ✅ Group 1 by category includes live external sales and refunds under their external categories (`reports.repository.ts` `salesByCategory`).
- ⚠️ PDF = `window.print()` (`reports/page.tsx:357`). No library/server PDF, no per-report download. Excel correctly absent (§16).
- ❌ Online sales, branch coverage, dedicated transfer/preparation flow reports, and complete correction histories remain missing against §1.7 (REPORT-1).

### 2.13 Data model (§15) ✅

Core tables for the earlier single-branch specification are present. Payroll uses `salaryAdvances`, `salaryAdjustments`, and `salaryPayments` in `schema.ts`. Extras remain justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache). Branch ownership, versioned online processing, reusable recipe links, and transaction correction history required by §1 still need model changes.

---

## 3. Backend — wrong logic / mismatches

### W2 + E5. Refund handles line types sales never produce [High]

Sales always `type:"external_product"` (`orders.service.ts:185`, `recipeId/itemId:null`); `orderInput` accepts only that type (`orders.schemas.ts:15-56`). Schema still allows `recipe|item|external_product` (`orderLines` `schema.ts:942`). Refunds validate all three types (`refunds.service.ts:169-189`); restore branches only for `item` and `external_product` (`:338-442`; recipe falls through with cash only). Direction 2026-09-19: keep all 3 line types and bring back internal POS sales per amended spec §7/§10. Fix: restore internal sales, or remove/guard the dead branches and amend the spec.

### W1. Only one open shift system-wide [Owner decision resolved; implementation open]

`schema.ts:834` `openSlot`, `:848` unique index, `shifts.repository.ts:76` writes `1`, close NULLs `:111`, reopen `:126`, `findCurrent where openSlot=1` `:136-141`, dup → 409 `:64-65`. Second cashier is blocked from sales/refunds/waste/expenses/requests (`orders.service.ts:102-105`, `refunds.service.ts:128-129`, `waste.service.ts:61-63`, `expenses.service.ts:78-79`, `transfers.service.ts:41-45`). Owner confirmed simultaneous shifts with one open shift per cashier account, branch-owned records, and Home/POS controls (§1.6). Replace every singleton assumption, including dashboard, payroll/worked-time, reopen guards, and dependent transaction lookups. Update `tests/db/shifts.test.ts:81` to require both distinct cashiers to succeed while a second shift for the same account remains blocked. The older one-drawer spec needs revision (DOC-REQ).

### B5. Multi-item waste locks in catalog order with no deadlock retry [Medium]

Each `inventory.consume` locks the item then its batches (`waste.service.ts:196-211`). Recipe ingredients are ordered by `recipe_ingredients.id` (`waste.repository.ts:117-127`); external ingredients keep catalog order. `transactionWithDeadlockRetry` is unused in waste (it wraps categories/orders/purchases/refunds/transfers). Concurrent cafe waste and a sale of overlapping items can deadlock; MySQL rolls back waste and the API returns 500. Fix: pre-lock waste item IDs `ORDER BY id FOR UPDATE` and wrap create in `transactionWithDeadlockRetry`.

### B6. Recipe waste targets prepared production recipes [Medium]

Spec §11 waste of a finished recipe product deducts that drink’s ingredients. The only recipes this API creates are `prepared` (`recipes.schemas.ts:34`). `listCatalogRecipes` lists every active recipe (`waste.repository.ts:167-197`); `loadRecipeProduct` (`:98-128`) does not require `type='product'`. Choosing a syrup/prep recipe consumes the formula ingredients and leaves the prepared output batch in cafe stock. Fix: catalog only `type='product'` as recipe-waste, or hide the recipe target until W2 lands; waste prepared goods as items.

### B7. Daily/hourly employees can be stored and never paid [Medium]

Spec §9 payday is `net = computed pay + bonuses − deductions − advances` for monthly/daily/hourly. Schema enum still has all three (`schema.ts:26`). Create is monthly-only (`employees.schemas.ts:42`); update still allows `daily`/`hourly` (`:67`). Payday 409s unless monthly (`salaries.service.ts:28-29`). The web form warns and clears legacy daily/hourly on save (`employee-modal.tsx:107-124`). Fix: implement daily/hourly computed pay (hourly from cashier shift minutes), or reject those types on update and amend spec §9 to monthly-only.

---

## 4. Frontend audit

**No route-path or payload-shape mismatches found in the flows that exist.** See Appendix B. Internal `recipe`/`item` order payloads are absent on purpose today (W2).

### 4.1 Broken / missing flows

Session handling remains in place: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx`). The permission policy itself needs AUTH-1: admin checkout is currently blocked and cashier Suppliers/Purchases/Recipes remain inaccessible. Add Home/POS shift controls (SHIFT-UI), reachable complete history (SHIFT-HIST), and accurate loaded/printed report ranges (REPORT-2). Cashier report-page exclusion remains intended.

---

## 5. Security

### [Low] External-orders `day` filter does not escape LIKE wildcards (SEC-3)

Search correctly escapes `\`, `%`, `_` (`external-orders.repository.ts:8-10,51-53`). The `day` prefix is interpolated as `` `${params.day}%` `` (`:61-64`) with no calendar-date parse. A cashier can pass `%` and widen the filter. Drizzle still parameterizes the pattern (wildcard injection, not SQL injection). Cashiers can already list the cache, so this is a filter hole. Fix: parse `day` as `YYYY-MM-DD` and/or run it through `escapeLike`.

Login cookie is `httpOnly` + `sameSite: 'lax'` + `secure: req.secure` (`auth.ts:46-55`). `tokenVersion` still bumps on password change and admin reset. LIKE search escaping (S4) still holds. CORS is an allowlist (`app.ts:38-44`).

---

## 6. Data integrity / concurrency

### DATA-1. Concurrent refunds of the same line can over-refund [High]

Refund create (`refunds.service.ts:121-138`) runs in a transaction with no isolation override (`db/index.ts:5-7` → InnoDB REPEATABLE READ). The first read is a non-locking `SELECT` on `client_request_id` (`refunds.repository.ts:130-139`), which starts the snapshot. The code then `SELECT … FOR UPDATE` the order and lines (waiters serialize on those rows) and **then** sums `refund_lines` with a non-locking `SUM` (`:92-102`). In REPEATABLE READ that sum still sees the snapshot from the first consistent read, so a refund that committed while this transaction waited is invisible. Two overlapping full refunds of the same remaining unit can both insert, pay cash twice, and `return_to_stock` twice. Unique `client_request_id` does not help when the two requests have different UUIDs. Sequential thirds test (`refunds.test.ts:283`) does not cover this.

Fix: locking read of `refund_lines` for those `order_line_id`s, or store/increment `refunded_quantity` on the already-locked `order_lines` row. Add a DB test that `Promise.all`s two refunds of the last remaining unit and expects one 201 and one 409, with a single stock movement.

Purchase item locking is ID-ordered like transfers (`purchases.repository.ts:52-70`, `purchases.service.ts:135-137`). Do not reopen the old purchase-vs-transfer deadlock claim. Deadlock retry (D4) still wraps categories/orders/purchases/refunds/transfers.

---

## 7. Missing tests

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s) + HTTP/MySQL tests (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts single-slot race, purchases duplicate-invoice race, categories inverse-move deadlock, deadlock-retry per wrapped service, stacked discounts, fixed-discount boundary e2e, orders double-spend race, transfer double-approve race, purchases/transfers sequential replay, cashier 403 on purchases/suppliers, stocktake surplus on an empty shelf + FIFO regression, category sales with a real external-product sale and refund (B1), worked minutes from reopened-shift segments (B4), zero-cash restock of a fully discounted sale (B8), concurrent same-key double-submit for purchases and refunds (tier 3)). Web: services/models/components mapping.

Gaps (highest value first):

1. Concurrent refunds over-refund race — two refunds of the same remaining unit (`Promise.all`). This is the test for DATA-1; `refunds.test.ts:283` covers sequential thirds only. The concurrent _same-key_ replay is now covered (tier 3).

2. ~~Concurrent double-submit of the same `clientRequestId` (purchases/refunds)~~ — done 2026-09-26; the existing behaviour held and is now pinned.

3. ~~100% discount refund (B8)~~ — done 2026-09-26.

Owner-requirement acceptance coverage to add with implementation (not assertions that the old behavior passes):

- AUTH-1/BRANCH-1: exact cashier page/action access, full admin access, one assigned branch per cashier, and denial of cross-branch list/get/write requests across all modules. Replace obsolete cashier Suppliers/Purchases 403 expectations.
- CRUD-1/ONLINE-3: edit/delete reversal and corrected effects, retained history, dependent balance/report reconciliation, and replay/race protection. Local online CRUD makes no upstream write; a cashier change affects only their branch.
- ONLINE-1: immediate new-order handling; first-activation/re-enable cutoff; no disabled-period backlog; one deduction per eligible order/branch across retries, concurrent imports, and restarts; intentional deductions in two branches.
- ONLINE-1/2/3: missing-config pending alert/retry, negative-stock deduction, upstream version changes, backend-priority rollback of local modifications, and staff cancellation return/waste exactly once using original allocations.
- RECIPE-1: one live recipe linked to several imported targets, future deductions use its changed formula, prior allocations/costs remain unchanged, and branch mappings stay isolated.
- W1/SHIFT-UI/SHIFT-HIST: distinct cashiers open concurrently within/across branches; the same account cannot open twice; every transaction attaches to the correct shift; Home/POS open/close works; history beyond 100 is reachable.
- REPORT-1: all basic flows, completed-only backend online sales counted once, per-branch deductions/costs/local changes, cancellation exclusion, and branch-safe totals.
- REPORT-2/3/4/5: changed dates without refresh and failed refresh cannot mislabel printed figures; overnight/reopened-shift period totals reconcile; negative quantity with zero minimum is visible; gross-profit/snapshot scope is explicit.

`apps/web/tests/architecture/*` still greps page source. `apps/web/tests/shared/` is empty (old pin files gone). `apps/api/tests/docs/` is empty. Prefer service/component tests over new file-contract tests.

---

## 8. DevOps / config gaps

Docker healthchecks and `NEXT_PUBLIC_API_URL` rebuild coupling match `docs/docker.md`. `migrate` and `cache-worker` probes call `scripts/process-liveness.cjs` and ignore their own process. Five Compose services (web :3010, api :4010, mysql, migrate, cache-worker) match the runbook. README local `pnpm dev` ports 3000/4000 are the local-dev cheat sheet. `docs/tmp-xx.md` was reticked 2026-09-24 against current code.

---

## 9. Forgotten edge cases

Additional open cases are now tracked in §1: pending online mappings, activation/re-enable boundaries, multi-branch deduplication, backend overrides of local changes, manual cancellation stock disposition, recipe-version history, shift history beyond 100, and report period/alert semantics. B8 remains fixed.

---

## 10. Priority fix order

Ordered easy → hard, because severity and effort do not line up here: DATA-1 is the worst bug in the list but it is tier 4, not tier 1.

**Tier 1 — easy (frontend only, no schema, no money)**

1. F4 — Arabic labels for report code columns. ✅ done 2026-09-26
2. F8 — stocktake confirm reason separate from the start note. ✅ done 2026-09-26
3. B3 — low stock requires `minimumLevel > 0`. ✅ done 2026-09-26

**Tier 2 — easy-medium (one query or test file)**

4. Purchases/suppliers cashier 403 tests. ✅ done 2026-09-26
5. B2 — surplus uses the last known batch cost. ✅ done 2026-09-26

**Tier 3 — medium (careful query rewrite, or a migration)**

6. B4 — worked hours computed from shift event segments. ✅ done 2026-09-26
7. B8 — zero-cash refund + relax `refunds_amount_positive_chk`. ✅ done 2026-09-26
8. §7.5,§7.3 — concurrent double-submit of the same `clientRequestId` (purchases/refunds). ✅ done 2026-09-26 (behaviour already held; pinned + mutation-checked)

**Tier 4 — hard (concurrency; must not change lock order)**

10. DATA-1 — concurrent over-refund race, plus the `Promise.all` test. ← next up
11. B5 — stable waste lock order + `transactionWithDeadlockRetry`.
12. B6 — recipe waste catalog only lists `type='product'`. Blocked on the W2 decision.

**Tier 5 — hard (features / spec decisions)**

13. §2.12 — server-side PDF vs print-only.
14. B7 — daily/hourly payroll, or amend spec §9 to monthly-only.
15. W1 — implement concurrent shifts with one open shift per cashier account, branch ownership, and direct Home/POS controls; owner decision resolved (§1.6).
16. W2 + E5 / §2.2 / §2.9 — internal POS sales. Largest item.

**Open older decisions:** §2.12 (PDF strategy) and the W2 direction, which B6 and the dead refund branches depend on. W1 is now a confirmed implementation requirement, not a single-drawer decision.

**2026-09-27 additions — dependency order:**

1. Fix REPORT-2/3/4/5 and SHIFT-HIST in the existing flows; these findings can be addressed without the new branch/online features.
2. Update the affected specification (DOC-REQ), then implement branch ownership/assignment throughout the model, API, worker, UI, and reports (BRANCH-1). Align AUTH-1, W1, and SHIFT-UI with that ownership.
3. Implement retained transaction corrections (CRUD-1), reusable recipe links/snapshots (RECIPE-1), and immediate versioned branch online processing (ONLINE-1/2/3). The upstream event/line-data contract must be verified before claiming immediate deduction works end-to-end.
4. Complete REPORT-1 for every implemented flow, including backend online revenue counted once and separate branch stock/correction effects. Verify these dependencies together with the acceptance cases in §7.

This dependency order supplements the existing money/concurrency fixes; it does not mark any new requirement complete or remove DATA-1/B5/B6/B7.

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside a single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts` throw-after-partial is rollback-safe.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses/purchases/transfers (C1/D5). Fingerprints use `request-fingerprint.ts` (M2).
- Duplicate purchase invoice race returns 409 (C1); external-product refunds restock or waste (C2); purchases/transfers lock items in ID order (W4); shared deadlock retry on five services (D4); recipe waste path exists for whatever recipes are stored (C2/§2.10); stacked-discount math pinned (E2); stocktake + manual adjustment module exists (E1/§2.3); blank stocktake counts rejected as missing (F2); POS size buttons match discounted tile/cart (F5); reports admin-guarded at mount (§2.1); LIKE search escaping (S4); env contract (S6).
- Recipe prepare: yield scaling, atomic consume, cycle reject, deactivation guards.
- Monthly payroll, advances, bonuses/deductions, payday net formula in integer cents, skip-month payday blocked, salary rows in cash-flow and employee history.
- Transfer approve rejects add/drop lines; quantity edits allowed.
- Stocktake surplus is valued at the last known batch cost (FIFO for a stocked shelf) instead of free.
- Configured low stock uses one shared rule (`minimumLevel > 0`) in the dashboard, report, and items list. This does not cover negative stock without a minimum (REPORT-4).
- Sales-by-category unions local recipe/item categories with external categories, so every live POS sale or refund has a category row.
- Worked hours in the employees report come from the same `shift_events` segments as the shift screen, clipped to the report range, so a closed gap after a reopen is not paid as work.
- A fully discounted (zero-cash) sale can be refunded and restocked; the remaining-cash guard still blocks real over-refunds.
- Concurrent double-submit of one `clientRequestId` replays to a single document for purchases and refunds (pinned, mutation-checked).
- Reports print Arabic for every code column; a stocktake reference and a stocktake kind decode independently, and a free-typed refund reason is never rewritten.
- Shift expected cash: `float + sales − refunds − shift expenses` (`shifts.service.ts:131-135`).
- Cache refresh `markSuccess` preserves a newer in-flight request.
- No SQLi: Drizzle params; raw `sql` columns only.
- `api build` builds `@cashier/shared` first (`api/package.json`) — keep.
- `changePassword` bumps `tokenVersion` + re-issues (`auth.repository.ts:26-34`, `auth.service.ts:48-66`); admin resets also bump (`users.repository.ts:51-60`).
- Frontend API shapes match backend for the older implemented flows (Appendix B); cookie-first + Tauri fallback and 401 clearing remain. Route gating exists, but the actual allowed pages/actions need AUTH-1; report range printing needs REPORT-2. Existing layout/cart/refund/receipt helpers do not establish the new branch/online/CRUD requirements.
- Docker: five services, healthchecks via `scripts/process-liveness.cjs` (probe ignores itself), `docs/docker.md` matches Compose. `docs/tmp-xx.md` reticked 2026-09-24.

---

## Appendix B. Verification matrix (frontend → backend match)

Matches below describe existing request/response contracts only, not completeness against §1. In particular, online-order CRUD/deduction, branch isolation, Home/POS shift controls, and full report coverage are not implemented by these matches.

| Frontend                                                                                                                         | Backend                                          | Verdict                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST /api/orders` + `clientRequestId/lines/discount/cashReceived` (`services/orders-service.ts`, `models/pos-model.ts:291-313`) | `orders.router.ts:9` + `orders.schemas.ts:15-59` | Match for `external_product` only. `setCartLineQuantity` clamps 1–999 (`pos-model.ts:187-199`) |
| `POST /api/refunds` (`refunds-service.ts`)                                                                                       | `refunds.router.ts:8`, `refunds.schemas.ts`      | Match (nullable `stockAction` null for recipe; required for item/external)                     |
| `GET /api/refunds/order/:orderId/quantities`                                                                                     | `refunds.router.ts`                              | Match                                                                                          |
| Shifts open/close/admin-close/reopen/correction (`shifts-service.ts`)                                                            | `shifts.router.ts:9-13`, `shifts.schemas.ts`     | Match                                                                                          |
| `GET /api/inventory/main\|cafe/stock` (`inventory-service.ts`)                                                                   | `inventory.router.ts:10-11` (main admin)         | Match; cafe page main only if `isAdmin`                                                        |
| `PUT /api/auth/password` (`auth-service.ts`)                                                                                     | `auth.router.ts`                                 | Match                                                                                          |
| Recipes CRUD + `/active`, `/:id/prepare`, `/preparations*` (`recipes-service.ts`)                                                | `recipes.router.ts`                              | Match; create body is `prepared` only                                                          |
| Transfers requests/approve/reject/direct (`transfers-service.ts`)                                                                | `transfers.router.ts`                            | Match; approve cannot add/drop lines                                                           |
| `POST /api/products/refresh`, `GET /refresh-status`, `PUT /:id/stock-setup` (`products-service.ts`)                              | `products.router.ts:15-17`                       | Match; list/refresh-status are cashier-readable                                                |
| `GET /api/reports?from&to`, `/dashboard` (`reports-service.ts`)                                                                  | `reports.router.ts:8-9`                          | Match                                                                                          |
| Salaries month/preview/advance/adjustment/pay (`salaries-service.ts`)                                                            | `salaries.router.ts`                             | Match; payday monthly-only (B7); month on/before latest paid is not payable                    |
| Stocktakes start/counts/confirm/manual (`stocktakes-service.ts`)                                                                 | `stocktakes.router.ts`                           | Match; blank counts rejected as missing                                                        |
