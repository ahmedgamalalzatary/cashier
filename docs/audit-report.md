# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-28 (POS product/stock model clarified; prior fixes remain recorded below)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`, `docs/docker.md`, `README.md`, `docs/tmp-xx.md`
**Method:** Source review covering prior open items, specification alignment, backend and frontend correctness, security, data integrity, tests, and DevOps. Every finding below was re-checked by file reads. Evidence format `path:line`.

**2026-09-27 requirements follow-up:** Read-only frontend → API → storage tracing, targeted unit/web tests, and direct owner clarification. No agents were used for that follow-up; database integration tests and the live deployment were not rerun then. Section 1 separates confirmed requirements from current implementation. Branches and concurrent shifts now have matching specification/rollout docs; permission and transaction-correction descriptions still need DOC-REQ.

**2026-09-28 POS clarification:** Owner confirmed five roles: local sellable stock item, local ingredient, local prepared result, imported sellable, and imported prepared result. A local item may be both sold as-is and used as an ingredient. Recipes consume ingredients when preparing a finished stock item; every sale later deducts a stock item, not the recipe's ingredients. Imported results use recipes defined or linked locally. Local main/subcategories and imported flat categories remain separate. The clarification was initially documentation-only; the local resale follow-up below implements its as-is sale subset. See §1.8.

**Local resale POS follow-up, 2026-09-28:** Local active priced resale items now appear in POS with their prices, stock units and main/subcategory navigation. Checkout accepts mixed `item`/`external_product` lines, reads local prices under item locks, consumes cafe FIFO stock and snapshots allocations for existing refund processing. No recipe is required. Local selling remains available without an external cache. Prepared-result sales and explicit imported fulfillment links remain open; this change covers the owner's imported 240 resale variants only. Verification covers real HTTP/MySQL FIFO sales, refunds, replay, mixed carts and branch isolation, plus web catalog/pricing/category regressions.

**Concurrent shifts follow-up:** W1, SHIFT-UI, and SHIFT-HIST are implemented in this workspace. Migration `0041` enforces one open shift per cashier account; Home/POS have direct controls and own-history access, admin views show every open branch shift, and history is paginated. HTTP/MySQL and client regression tests cover the requirements in §1.6. Production migration/deployment remains a separate rollout step; see [shifts.md](shifts.md).

**Reports follow-up, 2026-09-27:** Owner selected complete reporting for currently working flows and accepted browser Print / Save as PDF. REPORT-2/3/5 are fixed. Existing local coverage now includes dedicated transfer/request/preparation reports, purchase and expense details, dated shift events and separate lifetime reconciliation. Report sections share a read-only consistent database snapshot; UTC/Cairo handling, DST-start boundaries and closed-gap worked-shift counts are corrected. REPORT-1 remains open only for reporting dependent on the unfinished online/correction features. See [reports.md](reports.md). No schema migration is added; visual print-preview verification was unavailable because no browser was connected.

**Reports CodeRabbit follow-up:** CLI review of all 16 uncommitted files returned one minor finding. Added a current-branch display guard so a reused Reports page cannot show an old branch's range/figures under the new branch name, even without the existing workspace remount. The new component regression and all 27 report-focused web tests pass. Web lint/type/build checks cover the correction; the prior full repository checks remain recorded in `reports.md`.

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

| ID       | Problem                                                                                                    | State   | Evidence / note                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2 + E5  | Local prepared-result stock items cannot be sold through POS/API                                           | ❌ Open | Local resale sales and their main/subcategory navigation are implemented and tested. Prepared outputs still lack local selling prices/catalog support. Legacy recipe refunds remain separate from new item sales. |
| §2.9     | Prepared-result sale missing; old `recipes.type='product'` target conflicts with prepare-first model      | ❌ Open | Preparation API/UI already create output stock; `recipes.schemas.ts` creates `prepared` only. Local prepared pricing/sales remain open; see §1.8 and §2.9.                                |
| POS-MODEL | Imported as-is/result sales have no explicit stock-item fulfillment type                                  | ❌ Open | One-item `external_*_ingredients` mappings can deduct purchased or prepared output stock, but all base targets require an “ingredient” list and no imported result links to its local recipe. See §1.8.     |
| CAT-1    | Local and imported sales categories can merge by matching names in reports                                | ❌ Open | `reports.repository.ts` `salesByCategory` unions the two category sources, then groups by `mainCategory,category` text. See §2.2.                                                                           |

| B6       | Waste “recipe” target deducts ingredients instead of the prepared output item                              | ❌ Open | `waste.repository.ts` lists prepared recipes and loads their formula. Under §1.8, waste of a prepared result should consume the finished stock item, not ingredients again.                                |
| B7       | Daily/hourly pay types exist in spec/DB; payday is monthly-only                                            | ❌ Open | Spec §9; `schema.ts:26`; create monthly-only (`employees.schemas.ts:42`); payday 409 (`salaries.service.ts:28-29`); UI wipes daily/hourly on save (`employee-modal.tsx:107-124`)                              |
| AUTH-1   | Cashier permissions and admin restrictions conflict with confirmed access                                  | ❌ Open | `apps/web/src/lib/navigation.ts:9,10,12,18`; `apps/api/src/app.ts:72-75`; cashier-only sales/refunds/shift routes. See §1.1.                                                                                  |
| CRUD-1   | Full transaction CRUD with reversal and retained history absent                                            | ❌ Open | Orders/purchases/refunds/waste/expenses routers lack transaction update/delete routes; online orders are GET-only. See §1.3.                                                                                  |
| ONLINE-1 | Immediate, branch-controlled online stock deduction absent                                                 | ❌ Open | `cache-refresh.service.ts:4,110`: 12-hour summary import; `external-orders.client.ts:48,177` retains quantity count only. See §1.4.                                                                           |
| ONLINE-2 | Online order updates remain frozen after first import                                                      | ❌ Open | `external-orders.repository.ts:15,37` inserts unseen rows; duplicate update changes no stored values. See §1.4.                                                                                               |
| ONLINE-3 | Branch-local online CRUD, backend-priority reconciliation, and cancellation stock decisions absent         | ❌ Open | `orders.router.ts:7` exposes GET `/external`; cached summaries have no branch processing/reversal history. See §1.3–1.4.                                                                                      |
| RECIPE-1 | Imported prepared results cannot explicitly link to a local preparation recipe/output                     | ❌ Open | Current setup stores `itemId + quantity` lists, with no recipe identity. Recipe edits should affect future preparations, not deduct ingredients at sale. See §1.5 and §1.8.                                  |
| REPORT-1 | Online revenue/branch deductions and retained transaction-correction reports depend on unfinished features | ❌ Open | Current local flow coverage is implemented, including transfers/preparations and details. Global online recognition and branch processing/correction history still require ONLINE-1/2/3 and CRUD-1. See §1.7. |
| DOC-REQ  | Spec still needs confirmed permissions, correction rules, and prepare-first sale model                    | ❌ Open | Branch/shift and prepare-first POS/recipe docs are updated. AUTH-1/CRUD-1 legacy descriptions and explicit imported fulfillment documentation still need alignment.                              |

Removed 2026-09-26 (tier 3 of the §10 order, fixed with TDD): B4 — the employees report no longer measures `TIMESTAMPDIFF(opened_at, closed_at)`. It builds the same open segments the shift screen already walks: each `open`/`reopen` event starts a segment that ends at the next `close`/`admin_close` (or `closed_at`/now), clipped to the report range, so the overnight gap after an admin reopen is no longer paid as work (`reports.repository.ts` `employees`; `tests/db/reports.test.ts` asserts 180 minutes for a 2h + 1h pair, and that the report agrees with `GET /api/shifts` for the same shift). B8 — a fully discounted (zero-cash) sale can now be refunded and restocked: the service rejects only a negative amount instead of `<= 0`, and `refunds_amount_positive_chk` became `amount >= 0` (`schema.ts`; migration `0038_allow_zero_refund_amount.sql`). The over-refund guard on remaining cash is unchanged, so real over-refunds still 409 (`tests/db/refunds.test.ts` asserts a 0.00 refund with a `refund_return` movement and no waste; `tests/refunds/refunds.service.test.ts` "409s a zero-value refund" was inverted into "allows a zero-cash refund for a fully discounted order"). §7.5,§7.3 — concurrent same-`clientRequestId` double-submit is now pinned for purchases and refunds: both requests return 201 with one id and exactly one document, batch and stock movement (`tests/db/purchases.test.ts`, `tests/db/refunds.test.ts`). The existing `ER_DUP_ENTRY` replay path held, so these are characterisation tests; they were mutation-checked by removing the replay branch (refunds → 500, purchases → 409) and confirming both tests fail.

Removed 2026-09-28 (B5, fixed with TDD): Waste now sorts multi-item consumption by item ID, locks the affected stock rows in ID order, and retries the whole transaction once on `ER_LOCK_DEADLOCK`. The recipe loader locks ingredient-definition rows, then stock items in ID order, rather than locking joined stock rows during a result-ordered read. The retry and lock-order unit tests failed on the old service and pass after the fix; all nine real-MySQL waste tests pass. The concurrent DB tests are stock-consistency checks: they did not naturally reproduce a deadlock and are not claimed as retry-path proof.

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

**CodeRabbit follow-up, 2026-09-27:** CLI review of all 62 changed files in `backup-main...bd3c9fd` returned four findings. Fixed with regression tests: B2's historical-cost fallback had selected the oldest depleted batch, despite the earlier note claiming newest; it now selects the newest by receipt time then ID while stocked shelves retain FIFO order. REPORT-4 was a regression introduced in this branch diff by B3's unconditional positive-minimum guard; active negative balances now alert even with a zero minimum, while unconfigured nonnegative balances do not. Removed REPORT-4 from the open tracker; unit and real HTTP/MySQL tests cover both dashboard and reports. The incomplete workflow sentence in `AGENTS.md` now says not to run the full suite yet. The earlier B2 note describes the corrected behavior; its multi-depleted-batch coverage was missing until this follow-up.

Biggest verified remaining risks, most severe first (note this is **not** the §10 order, which is by effort):

Independent verification of B4 in the same branch diff also found two worked-time edge cases: a same-second open/close before reopening counted 1,560 minutes instead of 60, and two 40-second segments rounded to zero instead of one minute. The query now orders equal-time events by ID and sums seconds before rounding to minutes; real HTTP/MySQL tests compare those cases with the shift screen. CodeRabbit's review of the first seven follow-up files returned no code findings and one suggestion to change the owner's VPS sequencing rule; that suggestion was rejected because it contradicts the explicit instruction to assume success unless the user reports otherwise.

**Final verification:** CodeRabbit reviewed the six changed API source/test files again and returned zero findings. All 851 tests passed: 427 API unit, 200 HTTP/MySQL, and 224 web tests. API/web lint and typechecking, shared typechecking, and API/web production builds passed. The initial changes were committed as `bd3c9fd`; the review corrections remain uncommitted under the one-time commit authorization.

- ~~Two overlapping refunds of the same line can both pass the already-refunded check under MySQL REPEATABLE READ~~ (DATA-1 ✅ fixed 2026-09-28: locking `refundedQuantities` read).
- Local resale sales and main/subcategory navigation are restored. Local prepared-result sales and explicit imported fulfillment remain open (W2 + E5, POS-MODEL, §2.9).
- Owner-confirmed requirements are not met end-to-end: full permissions/transaction CRUD, immediate online stock processing, reusable recipe links, and basic reporting of every business flow (§1). The presence of pages or six report tabs does not establish complete coverage.

Severity and effort do not line up: DATA-1 is the worst bug here but sits in tier 4 of §10, while the tier 1–3 items are cosmetic or one-query changes and are all now done; tier 3 closed B4 (worked hours), B8 (zero-cash refund) and the concurrent same-key replay gap.

Previously closed money bugs (duplicate invoice 409, external refund restock, idempotency, deadlock retry, stacked discounts, salaries module, stocktake module) still hold.

---

## 1. Owner-confirmed requirements and gaps

Confirmed directly with the owner on 2026-09-27 and, for the POS product/stock model (§1.8), 2026-09-28. These requirements supersede conflicting older assumptions. Branch workspaces (§1.2) and concurrent shifts (§1.6) are implemented; the other feature gaps remain implementation work. Preserve existing unrelated findings and fix history.

### 1.1 Permissions (AUTH-1)

- Cashier has full create/read/update/delete permissions in exactly these areas: **Home, POS, Orders (cashier and online tabs), Cafe, Suppliers, Purchases, Expenses, Waste, Refunds, Recipes**. Full access includes supplier/payment operations, purchase recording, product stock configuration, and recipe preparation in those areas.
- The separate Shifts page is excluded from cashier access; open/close controls belong in Home and POS (§1.6). Other unlisted pages remain excluded, including users, employees, payroll, reports, categories, main warehouse, and stocktakes.
- Admin has full access to every branch and all features. Current cashier-only transaction restrictions are not the target admin permission model.
- Implement the same rules in navigation, direct-page access, APIs, and branch ownership checks. Permission to use a page must not expose another branch's records.
- **Current state: partial.** Suppliers, Purchases, and Recipes are admin-only in navigation and API mounts (`navigation.ts:9,10,18`; `app.ts:72-75`). Shifts is now admin-only with direct cashier controls on Home/POS. Expense-category and product-configuration writes also retain admin gates. Existing cashier-403 tests document the old permissions, not acceptance of the new requirements.

### 1.2 Branch workspaces (BRANCH-1)

- Each branch is an independent workspace with its own operational data and configuration: employees, payroll, stock, products, recipes/mappings, suppliers, purchases/payments, orders, shifts, expenses, waste, refunds, preparations, transfers, and reports.
- Admin assigns each cashier to **exactly one branch**. Cashier actions affect only that branch; admin can access all branches.
- Apply branch ownership throughout storage, relations, queries, mutations, histories, reports, and background processing. Enforce it server-side, including direct requests for IDs belonging to another branch.
- The same imported online order can intentionally produce stock deductions in several branches (§1.4). Its source identity is shared; branch operational records and effects remain separate.
- **Current state: implemented.** Migrations `0039_branch_workspaces`/`0040_branch_owned_data` preserve existing data in **الفرع الرئيسي** and add ownership/scoped keys/references. Admin branch lifecycle APIs/UI, workspace selection, employee-derived cashier assignment, server-side scopes across existing flows/reports, and per-active-branch worker passes/leases are in place. New catalog copies reset ingredient/modifier setup. Archived records remain readable to admins; cashier login/operational writes are blocked. Moving staff requires new employee/account records in the destination workspace. See `docs/branches.md` and `tests/db/branches.test.ts` (12 passing database cases). Browser interaction could not be visually verified because no computer-use browser was connected; `/branches/` HTTP serving and client scope/route guards were verified.

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
- Use each branch's configured finished stock item for the ordered product/size: a purchased item for as-is products or a prepared output item for results. Preparation consumes the recipe ingredients beforehand. Modifier stock effects still need a separate owner rule. Persist processing state, item quantities, costs, and stock movements so re-imports, retries, concurrent processing, and worker restarts cannot duplicate effects.
- Missing configuration in a branch means **pending deduction + visible alert + automatic retry after configuration**. One branch's missing mapping must not prevent another eligible branch's processing. A configured product with insufficient stock still deducts and flags negative stock, like POS.
- If cancelled after deduction, **staff decide return the deducted stock item or record waste** for the affected branch. Do not automatically restore recipe ingredients. Record the decision and effects; duplicate handling must not repeat them. Cancellation excludes the sale from online revenue separately from this stock decision.
- Existing online orders must update their backend status/amount/content when the source changes, with the local correction behavior in §1.3.
- **Current state: deduction absent; display/import partial.** `cache-refresh.service.ts:4,101,110` refreshes catalog/order summaries every 12 hours. `external-orders.client.ts:48,177` reduces order lines to item count, without a retained line definition usable for stock deductions. `external-orders.repository.ts:37` makes duplicate imports a no-op, freezing statuses and amounts. `schema.ts:716` contains a summary cache, not a branch/version stock-processing ledger.
- **Integration dependency to verify during implementation:** immediate delivery of new/changed orders and complete product/size/modifier line data from the backend. The current integration only reads summary endpoints; the existing cache alone cannot meet these requirements.

### 1.5 Imported prepared-result links (RECIPE-1)

- An imported result uses a recipe defined or linked locally. Preparing **R1** consumes **P1/P2/P3** and creates a finished stock item **X**. The imported product/size sells and deducts **X**, rather than expanding R1's ingredients at checkout or online-order arrival.
- Keep the recipe/output relationship identifiable in the imported product's setup. Editing R1 changes **future preparations**; existing X batches retain their original costs, and past sales, stock movements, cancellations, and corrections remain unchanged.
- **Current state: partial.** Prepared recipes already create costed X batches, and an imported product can map to `1 X` through the existing `itemId + quantity` setup. The UI/API call this an ingredient mapping and do not identify the imported product as a prepared result or link it to R1 (`product-stock-setup-modal.tsx`, `products.schemas.ts`, `external_*_ingredients`). This is separate from enabling local POS sales (W2 + E5). The earlier instruction to expand a live recipe at sale time is superseded by the owner's prepare-first clarification (§1.8).

### 1.6 Concurrent shifts and accessible history (W1, SHIFT-UI, SHIFT-HIST)

- Support 2, 3, 4, 5, etc. simultaneously open shifts for different cashiers, in the same branch or different branches. Enforce **one open shift per cashier account**, not one for the entire system.
- Store separate cashier/branch records, opening float, sales, refunds, expenses, actual/expected cash, over/short, worked time, and event history for every shift. Actions must attach to the correct cashier's shift in the correct branch.
- Cashiers open/close shifts directly from **both Home and POS**, without access to the separate Shifts page. Admin retains full access to shift administration/history.
- Keep all successive shift history reachable; the current latest-100 list needs pagination or equivalent retrieval, not deletion of older records.
- **Current state: implemented.** Migration `0041_cashier_concurrent_shifts` enforces unique `(cashier_user_id, open_slot)`. Current-shift lookup is cashier-specific; each transaction retains its own branch/shift effects. Admin dashboard and Shifts show every open shift; reopen conflicts only with another open shift for the same cashier. Home/POS provide counted-float opening, counted-cash closing, and the cashier's own paginated history with event details. Admin history has pagination and audit details. Home's Cairo-day lookup includes all today's shifts instead of truncating them at 100. See [shifts.md](shifts.md) for API and rollout details.

### 1.7 Basic informative reporting of every flow (REPORT-1 dependencies pending; REPORT-2/3/4/5 fixed)

- Owner requires **basic, informative operational reports covering every business flow**. Cover sales (POS and online), discounts, stock/value/movements, transfers, recipe preparation, purchases/suppliers/payments, expenses, waste, refunds, employee/payroll activity, and shifts, with relevant dates, quantities, amounts, costs, status, and responsible staff. Apply branch boundaries and clear date semantics.
- Count an online sale **once across the system**, using the backend's amount and status. Recognize only **completed** online orders; cancelled orders are excluded. Show each branch's own stock deduction/cost and branch-local changes separately. Never multiply online revenue by the number of branches that consumed stock.
- **Current local coverage: implemented, with CAT-1 open.** Seven report groups isolate the selected branch and include dedicated transfers/requests and preparations/ingredients, purchase-line and expense-entry detail, dated shift actions/close corrections and separate lifetime shift reconciliation. Existing sales/discounts, stock/movements/stocktakes, cash flow, payroll, waste/refunds and supplier reports remain. Report sections share a consistent read-only transaction; category-name collisions between local/imported sources still need correction. See `reports.md` for the complete contract and date semantics.
- **REPORT-2 — fixed:** display/print reads the loaded `range`, including branch/generation time. Edited inputs show an unapplied-period notice; refresh clears previous data and blocks printing until a successful response. Obsolete responses are ignored.
- **REPORT-3 — fixed:** shift sales/refunds use their transaction dates, even for shifts opened earlier or reopened. Lifetime amounts and dated whole-shift close/correction snapshots are labelled separately. Employee worked-shift counts exclude closed gaps between segments.
- **REPORT-5 — fixed:** all profit labels say **gross profit** and explain `sales - refunds - cost + returned cost`, excluding expenses/payroll/waste. Current stock and all-time supplier balances are explicitly current snapshots, not historical closing balances. UTC raw-query parameters/results and Cairo rendering are aligned; the first valid instant is used when DST skips midnight. Date-only entries have no invented time.
- **REPORT-1 still pending:** global completed-only online revenue counted once, each branch's online stock/cost/local corrections and retained transaction edit/delete history cannot be reported until ONLINE-1/2/3 and CRUD-1 are implemented. Cached online summaries are not treated as POS revenue or cash flow. This task's owner-approved scope is current working flows with those dependencies identified.
- Advanced accounting, a new net-profit calculation, historical balance reconstruction, and a comprehensive permission-change audit report were not confirmed as additions. Browser Print / Save as PDF was explicitly accepted on 2026-09-27; the older separate PDF-export gap is closed. Print-preview layout remains visually unverified because no browser was connected.

### 1.8 POS products, stock, and categories (2026-09-28 owner clarification)

- **Five roles:** local sellable as-is, local ingredient, local prepared result, imported sellable as-is, and imported prepared result. These describe use, not five mutually exclusive database item types: the same local stock item may be both sold as-is and used as a recipe ingredient. An imported product is never itself an ingredient.
- **Sale rule:** every as-is or result sale deducts a matching cafe stock item. A result is prepared into stock **before** sale; preparation consumes its recipe ingredients and receives the finished item at its computed cost. Later POS or online sale consumes the finished item, not its ingredients again. Imported recipes are defined or linked locally; the upstream catalog supplies no ingredient formula (`external-catalog.client.ts`).
- **What works now:** local stock/ingredient management and prepared recipes with costed output batches work. Active priced `resale` items appear in POS and sell without recipes; checkout accepts `item` and `external_product` lines. Local item sales deduct cafe FIFO stock and support existing return-to-stock/waste refund choices at original allocation costs. Imported products can sell a purchased item or a prepared output item via a one-item base/size mapping; the mapping is labelled “ingredients,” and no explicit as-is/result choice or recipe/output link exists.
- **Categories:** retain the separate branch-local two-level category tree and imported flat categories. POS now shows local main/subcategories and a separate imported flat group. Imported sale listings retain their upstream category even if they consume a local item in another category. Category determines browsing/report grouping, not stock behavior. `salesByCategory` can still merge unrelated local/imported categories with identical names (CAT-1).
- **Spec conflict:** `system-specs.md` §7/§10 describes recipe products consuming ingredients at sale time and treats `recipes.type='product'` as the missing local sale path. That is not the clarified prepare-first result. Align the specification and dependent online/waste/refund expectations before implementing W2 + E5, RECIPE-1, or POS-MODEL. No source behavior changed during this audit update.

---

## 2. Spec vs implementation gaps

Source: `docs/system-specs.md`, `docs/docker.md`, `README.md` vs `apps/api/src`, `apps/web/src`, `packages/shared/src`. For POS products/results, the newer owner clarification in §1.8 supersedes the older §7/§10 sale-time recipe target; the specification has not yet been updated.

| #    | Spec module (§)                        | Status                                                                   |
| ---- | -------------------------------------- | ------------------------------------------------------------------------ |
| §3   | Categories (main → sub tree)           | ⚠️ Partial — local tree OK; POS two-level nav lost                       |
| §7   | POS local stock-item sales             | ⚠️ Gap — imported catalog only; old recipe-line target needs revision    |
| §9b  | Salaries / advances / bonuses / payday | ⚠️ Partial — monthly implemented; daily/hourly unrestored (B7)           |
| §10  | Recipes and prepared-result sales      | ⚠️ Partial — preparation works; local sale and imported link are missing |
| §11  | Waste                                  | ⚠️ Partial — item + external work; recipe path hits prepared (B6)        |
| §14b | Reports (7 groups)                     | ⚠️ Current flows covered except CAT-1; online/CRUD dependencies remain   |
| §14c | PDF export                             | ✅ Owner accepted browser Print / Save as PDF; visual preview unverified |
| §15  | Data model                             | ⚠️ Core present; clarified fulfillment links and online history missing  |

Branch ownership/assignment is implemented across the existing flows. Roles/full CRUD, online stock deduction and complete report coverage still need their separate §1 changes. Current admin POS checkout remains blocked (`requireRole("cashier")` + POS banner), which conflicts with the full-access target; cashier report-page exclusion remains intended.

### 2.2 Categories (§3) — ⚠️ Partial

- ✅ Local tree + admin CRUD: `schema.ts:129-139` (`parentId`), `categories.router.ts`.
- ✅ POS local resale navigation now uses main-category tabs and subcategory filters, including all children when a main category is selected; imported categories remain a separate flat group. Local and imported product/category IDs are kept separate.
- ❌ CAT-1: `reports.repository.ts` `salesByCategory` unions local and imported rows and groups by category names. Equal local/imported names can combine unrelated sales and refunds into one report row; retain source/category identity when aggregating.
- **Direction:** restore internal main/sub tabs alongside the separate imported flat categories. Do not infer a product's stock behavior from its category (§1.8).

### 2.8 Employees and payroll (§9) ⚠️ Partial

- ✅ CRUD + grant/revoke (`employees.router.ts`, `employees.service.ts:55-118`).
- ✅ Monthly payroll: `salaryAdvances`, `salaryAdjustments`, `salaryPayments` in `schema.ts` plus migration `0037_worried_moira_mactaggert.sql`.
- ✅ Admin APIs `/api/salaries`; UI `apps/web/src/app/salaries/page.tsx`.
- ✅ Salary payments and advances feed cash-flow; payments/advances/adjustments feed employee history (`reports.repository.ts` `cashFlow`, `salaryHistory`).
- ❌ Daily/hourly: spec §9 still lists those pay types. Create schema is monthly-only (`employees.schemas.ts:42`). Payday 409s unless monthly (`salaries.service.ts:28-29`). The employee form offers monthly and clears daily/hourly on save (`employee-modal.tsx:107-124`). See B7.

### 2.9 Recipes (§10) ⚠️ Partial

Prepared-result work exists in both the API and Recipes UI: `POST /:id/prepare` (`recipes.router.ts:14`), FIFO preview, immutable `preparations` + allocations, yield scaling (`recipes.service.ts:170-180`), atomic output batches, deactivation guards, and cycle rejection. Past preparations retain their names and costs.

Still missing under §1.8: local prepared-output pricing and a POS sale path that deducts that finished stock item, plus an explicit imported-result link to its local recipe/output. Local resale items now sell without recipes. The specification's POS/recipe sections now describe prepare-first results; `recipes.schemas.ts` creates `prepared` only. `RecipeMargin` is unused and the cost-%/margin presentation target still needs review against the clarified model.

### 2.12 Reports/dashboard/PDF (§14+§2)

- ✅ Dashboard: local POS sales/refunds/discounts/gross profit/orders, all open shifts in the selected branch, configured low-stock and active negative-stock alerts, pending transfers (`reports.service.ts`, `reports.repository.ts`). REPORT-4's zero-minimum regression is fixed and tested in both dashboard and reports.
- ✅ Local sales, waste/refunds, suppliers and stocktake reports; loaded-range printing, period shift totals, gross-profit/current-snapshot labels and Cairo/DST boundaries are fixed (REPORT-2/3/5).
- ✅ Group 3 includes salary payments and advances in cash-flow; group 4 includes salary history (`reports.repository.ts` `cashFlow`, `salaryHistory`).
- ✅ Group 1 by category includes live external sales and refunds under their external categories (`reports.repository.ts` `salesByCategory`).
- ❌ CAT-1: local and imported categories with the same names can be combined in that report; source/category identity is lost during aggregation (§2.2).
- ✅ Dedicated transfers/requests, preparation outputs/ingredients, purchase-line/expense-entry detail and dated shift-event/reconciliation reports are branch-scoped.
- ✅ Browser `window.print()` / Save as PDF is the owner-accepted export strategy (2026-09-27). No separate download is required; Excel remains excluded (§16). Visual print-preview verification was unavailable.
- ❌ Global online revenue, branch online deductions/costs/local changes and complete transaction correction histories remain dependent on ONLINE-1/2/3 and CRUD-1 (REPORT-1).

### 2.13 Data model (§15) ⚠️ Partial

Core tables and branch ownership/scoped keys/references are present. Payroll uses `salaryAdvances`, `salaryAdjustments`, and `salaryPayments` in `schema.ts`. Extras remain justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache). Explicit as-is/prepared-result fulfillment and imported recipe/output links (§1.8), versioned online deduction processing, and transaction correction history required by §1 still need model changes.

---

## 3. Backend — wrong logic / mismatches

### W2 + E5. Local stock-item sales absent; legacy refund branches remain [High]

Sales always `type:"external_product"` (`orders.service.ts`, `recipeId/itemId:null`); `orderInput` accepts only that type (`orders.schemas.ts`). The database still allows `recipe|item|external_product` order lines, and refunds contain branches for all three. Under §1.8, local as-is and prepared-result sales should both deduct the sold stock item; preparing a result already consumed its ingredients. Restore local POS/API sales and review the historical `recipe` line/refund behavior against that rule. Do not restore checkout-time ingredient consumption solely to satisfy the older §7/§10 wording.

### B6. Recipe waste deducts a prepared result's ingredients again [Medium]

The only recipes this API creates are `prepared` (`recipes.schemas.ts`). `listCatalogRecipes` lists every active recipe (`waste.repository.ts`); choosing one as recipe waste consumes its formula ingredients and leaves its already-prepared output batch in cafe stock. Under §1.8, waste of a prepared result should deduct that finished stock item. The existing item-waste path can represent this; remove or guard the misleading prepared-recipe waste target rather than deducting ingredients again. The older §11 recipe-waste description needs alignment.

### B7. Daily/hourly employees can be stored and never paid [Medium]

Spec §9 payday is `net = computed pay + bonuses − deductions − advances` for monthly/daily/hourly. Schema enum still has all three (`schema.ts:26`). Create is monthly-only (`employees.schemas.ts:42`); update still allows `daily`/`hourly` (`:67`). Payday 409s unless monthly (`salaries.service.ts:28-29`). The web form warns and clears legacy daily/hourly on save (`employee-modal.tsx:107-124`). Fix: implement daily/hourly computed pay (hourly from cashier shift minutes), or reject those types on update and amend spec §9 to monthly-only.

---

## 4. Frontend audit

**No route-path or payload-shape mismatches found in the flows that exist.** See Appendix B. Local stock-item order payloads are absent today (W2 + E5); the old `recipe` payload concept needs review against §1.8.

### 4.1 Broken / missing flows

Session handling remains in place: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx`). The permission policy itself needs AUTH-1: admin checkout is currently blocked and cashier Suppliers/Purchases/Recipes remain inaccessible. Home/POS shift controls and reachable complete history are implemented (§1.6). Loaded/printed report ranges are fixed (REPORT-2, §1.7). Cashier report-page exclusion remains intended.

---

## 5. Security

### [Low] External-orders `day` filter does not escape LIKE wildcards (SEC-3)

Search correctly escapes `\`, `%`, `_` (`external-orders.repository.ts:8-10,51-53`). The `day` prefix is interpolated as `` `${params.day}%` `` (`:61-64`) with no calendar-date parse. A cashier can pass `%` and widen the filter. Drizzle still parameterizes the pattern (wildcard injection, not SQL injection). Cashiers can already list the cache, so this is a filter hole. Fix: parse `day` as `YYYY-MM-DD` and/or run it through `escapeLike`.

Login cookie is `httpOnly` + `sameSite: 'lax'` + `secure: req.secure` (`auth.ts:46-55`). `tokenVersion` still bumps on password change and admin reset. LIKE search escaping (S4) still holds. CORS is an allowlist (`app.ts:38-44`).

---

## 6. Data integrity / concurrency

### DATA-1. Concurrent refunds of the same line can over-refund [High] — ✅ fixed 2026-09-28

Refund create (`refunds.service.ts:121-138`) runs in a transaction with no isolation override (`db/index.ts:5-7` → InnoDB REPEATABLE READ). The first read is a non-locking `SELECT` on `client_request_id` (`refunds.repository.ts:130-139`), which starts the snapshot. The code then `SELECT … FOR UPDATE` the order and lines (waiters serialize on those rows) and **then** summed `refund_lines` with a non-locking `SUM` (`refundedQuantities`). In REPEATABLE READ that sum still saw the snapshot from the first consistent read, so a refund that committed while this transaction waited was invisible. Two overlapping full refunds of the same remaining unit could both insert, pay cash twice, and `return_to_stock` twice. Unique `client_request_id` does not help when the two requests have different UUIDs.

Fix: `refundedQuantities` is now a locking read (`.for("update")`). Waiters were already serialized on the shift/order row locks, so the second request's locking `SUM` runs after the first one commits and sees its `refund_lines` rows → 409. No lock-order change, no schema change. Verified by `tests/db/refunds.test.ts` "rejects a concurrent refund of the same remaining unit from a different request": two `Promise.all`ed refunds (distinct `clientRequestId`) of the last remaining unit → one 201 + one 409, one refund document, one `refund_return` movement, shift refunds total counted once. The test was red (`[201, 201]`) before the fix and green after.

Purchase item locking is ID-ordered like transfers (`purchases.repository.ts:52-70`, `purchases.service.ts:135-137`). Do not reopen the old purchase-vs-transfer deadlock claim. Deadlock retry (D4) still wraps categories/orders/purchases/refunds/transfers.

---

## 7. Missing tests

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s) + HTTP/MySQL tests (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts per-cashier concurrency and same-account race, purchases duplicate-invoice race, categories inverse-move deadlock, deadlock-retry per wrapped service, stacked discounts, fixed-discount boundary e2e, orders double-spend race, transfer double-approve race, purchases/transfers sequential replay, cashier 403 on purchases/suppliers, stocktake surplus on an empty shelf + FIFO regression, category sales with a real external-product sale and refund (B1), worked minutes from reopened-shift segments (B4), zero-cash restock of a fully discounted sale (B8), concurrent same-key double-submit for purchases and refunds (tier 3)). Web: services/models/components mapping.

Gaps (highest value first):

1. ~~Concurrent refunds over-refund race~~ — done 2026-09-28; `Promise.all` of two different-key refunds of the last remaining unit expects one 201 and one 409 with a single stock movement.

2. ~~Concurrent double-submit of the same `clientRequestId` (purchases/refunds)~~ — done 2026-09-26; the existing behaviour held and is now pinned.

3. ~~100% discount refund (B8)~~ — done 2026-09-26.

Owner-requirement acceptance coverage to add with implementation (not assertions that the old behavior passes):

- AUTH-1/BRANCH-1: exact cashier page/action access, full admin access, one assigned branch per cashier, and denial of cross-branch list/get/write requests across all modules. Replace obsolete cashier Suppliers/Purchases 403 expectations.
- CRUD-1/ONLINE-3: edit/delete reversal and corrected effects, retained history, dependent balance/report reconciliation, and replay/race protection. Local online CRUD makes no upstream write; a cashier change affects only their branch.
- ONLINE-1: immediate new-order handling; first-activation/re-enable cutoff; no disabled-period backlog; one deduction per eligible order/branch across retries, concurrent imports, and restarts; intentional deductions in two branches.
- ONLINE-1/2/3: missing-config pending alert/retry, negative-stock deduction of the configured finished stock item, upstream version changes, backend-priority rollback of local modifications, and staff cancellation return/waste exactly once using original allocations.
- W2 + E5 / POS-MODEL: a local item can be both an ingredient and sold as-is; local purchased and prepared output items sell through POS/API with one finished-item stock deduction. Imported as-is/result listings also deduct their mapped finished item; no recipe ingredient is deducted again at sale.
- RECIPE-1: an imported prepared result identifies its local recipe/output item; edits affect future preparations, while existing output batches and prior sale/stock/cancellation costs remain unchanged. Keep branch mappings isolated.
- W1/SHIFT-UI/SHIFT-HIST: covered by `tests/db/shifts.test.ts` and web shift-component/access tests: distinct cashiers concurrently within/across branches, same-account duplicate rejection, five transaction flows with separate cash totals, branch isolation, direct Home/POS controls, reopen guards, selected-shift preservation during refresh, event details, and history/Home daily totals beyond 100.
- REPORT-1: current local transfers/preparations/purchase/expense details and branch-safe totals are covered. Completed-only global online sales, branch deductions/costs/local changes, cancellation exclusion and retained correction history remain acceptance work for their dependent features.
- REPORT-2/3/5: covered by report component and real HTTP/MySQL tests: changed dates, failed/successful refreshes, obsolete responses, overnight/reopened/refund-only period totals, concurrent database snapshots, closed-gap shift counts, Cairo midnight/DST, calendar-date rendering and gross-profit/current-snapshot labels. REPORT-4's negative-stock/zero-minimum cases remain covered.

`apps/web/tests/architecture/*` still greps page source. `apps/web/tests/shared/` is empty (old pin files gone). `apps/api/tests/docs/` is empty. Prefer service/component tests over new file-contract tests.

---

## 8. DevOps / config gaps

Docker healthchecks and `NEXT_PUBLIC_API_URL` rebuild coupling match `docs/docker.md`. `migrate` and `cache-worker` probes call `scripts/process-liveness.cjs` and ignore their own process. Five Compose services (web :3010, api :4010, mysql, migrate, cache-worker) match the runbook. README local `pnpm dev` ports 3000/4000 are the local-dev cheat sheet. `docs/tmp-xx.md` was reticked 2026-09-24 against current code.

---

## 9. Forgotten edge cases

Additional open cases are now tracked in §1: pending online mappings, activation/re-enable boundaries, multi-branch deduplication, backend overrides of local changes, manual cancellation stock disposition, recipe-version history and report period/alert semantics. B8 remains fixed.

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

9. DATA-1 — concurrent over-refund race, plus the `Promise.all` test. ✅ done 2026-09-28 (locking `refundedQuantities` read; red `[201, 201]` → green `[201, 409]`)
10. B5 — stable waste lock order + `transactionWithDeadlockRetry`. ✅ done 2026-09-28
11. B6 — prepared-result waste deducts the finished output item, not its recipe ingredients. The existing item-waste path can represent it; this no longer depends on restoring checkout-time recipe sales.

**Tier 5 — hard (features / spec decisions)**

12. §2.12 — ✅ owner accepted browser Print / Save as PDF, 2026-09-27.
13. B7 — daily/hourly payroll, or amend spec §9 to monthly-only.
14. W1 / SHIFT-UI / SHIFT-HIST — ✅ implemented 2026-09-27: per-cashier concurrency, branch ownership, direct Home/POS controls, complete paginated history, and all-open-shift admin views (§1.6).
15. W2 + E5 / POS-MODEL / §2.2 / §2.9 — local stock-item POS sales and explicit imported as-is/prepared-result fulfillment. Align the old spec first. Largest item.

**2026-09-28 direction:** The owner resolved W2's core business rule: prepare results into stock first, then sell/deduct the finished item (§1.8). Review legacy `recipe` sale/refund branches and §7/§10/§11 before implementation. Modifier stock effects were not clarified in this follow-up. W1 is implemented (§1.6); browser Print / Save as PDF is accepted (§1.7).

**2026-09-27/28 additions — dependency order:**

1. REPORT-2/3/5 and current local flow reports are implemented (§1.7). REPORT-4 was fixed during the CodeRabbit follow-up.
2. Branch ownership/assignment throughout model, API, worker, UI, and existing reports (BRANCH-1) is implemented. Branch specification/rollout docs are updated. Complete AUTH-1 and the remaining capability/CRUD documentation against this ownership.
3. Align `system-specs.md` with §1.8, then implement local stock-item sales (W2 + E5), explicit imported fulfillment (POS-MODEL), prepared-result links (RECIPE-1), retained transaction corrections (CRUD-1), and immediate versioned branch online processing (ONLINE-1/2/3). The upstream event/line-data contract must be verified before claiming immediate deduction works end-to-end.
4. Complete REPORT-1 for every implemented flow, including backend online revenue counted once and separate branch stock/correction effects. Verify these dependencies together with the acceptance cases in §7.

This dependency order supplements the completed money/concurrency fixes; B6/B7 remain open.

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside a single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts` throw-after-partial is rollback-safe.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses/purchases/transfers (C1/D5). Fingerprints use `request-fingerprint.ts` (M2).
- Duplicate purchase invoice race returns 409 (C1); external-product refunds restock or waste (C2); purchases/transfers/waste lock stock items in ID order (W4/B5); shared deadlock retry covers six services (D4/B5); recipe waste path exists for whatever recipes are stored (C2/§2.10); stacked-discount math pinned (E2); stocktake + manual adjustment module exists (E1/§2.3); blank stocktake counts rejected as missing (F2); POS size buttons match discounted tile/cart (F5); reports admin-guarded at mount (§2.1); LIKE search escaping (S4); env contract (S6).
- Recipe prepare: yield scaling, atomic consume, cycle reject, deactivation guards.
- Monthly payroll, advances, bonuses/deductions, payday net formula in integer cents, skip-month payday blocked, salary rows in cash-flow and employee history.
- Transfer approve rejects add/drop lines; quantity edits allowed.
- Stocktake surplus is valued at the last known batch cost (FIFO for a stocked shelf) instead of free.
- Dashboard and report stock alerts include active negative balances regardless of minimum level; nonnegative balances alert only at/below a configured positive minimum. Unit and HTTP/MySQL regression tests cover the rule (REPORT-4 fixed).
- Sales-by-category unions local recipe/item categories with external categories, so every live POS sale or refund has a category row.
- Worked hours in the employees report come from the same `shift_events` segments as the shift screen, clipped to the report range, so a closed gap after a reopen is not paid as work.
- A fully discounted (zero-cash) sale can be refunded and restocked; the remaining-cash guard still blocks real over-refunds.
- Concurrent double-submit of one `clientRequestId` replays to a single document for purchases and refunds (pinned, mutation-checked).
- Reports print Arabic for every code column; a stocktake reference and a stocktake kind decode independently, and a free-typed refund reason is never rewritten.
- Shift expected cash: `float + sales − refunds − shift expenses` (`shifts.service.ts:131-135`).
- Concurrent cashier shifts within/across branches, one open shift per account, direct Home/POS controls, all-open-shift admin views, and retained paginated history with events (§1.6; migration `0041`).
- Cache refresh `markSuccess` preserves a newer in-flight request.
- No SQLi: Drizzle params; raw `sql` columns only.
- `api build` builds `@cashier/shared` first (`api/package.json`) — keep.
- `changePassword` bumps `tokenVersion` + re-issues (`auth.repository.ts:26-34`, `auth.service.ts:48-66`); admin resets also bump (`users.repository.ts:51-60`).
- Frontend API shapes match backend for the implemented flows (Appendix B); cookie-first + Tauri fallback and 401 clearing remain. Route gating exists, but the actual allowed pages/actions need AUTH-1. Report range printing and current-flow reporting are fixed (§1.7); online/CRUD reporting still depends on those unfinished features.
- Docker: five services, healthchecks via `scripts/process-liveness.cjs` (probe ignores itself), `docs/docker.md` matches Compose. `docs/tmp-xx.md` reticked 2026-09-24.

---

## Appendix B. Verification matrix (frontend → backend match)

Matches below describe existing request/response contracts only, not completeness against §1. In particular, online-order CRUD/deduction and full report coverage are not implemented by these matches.

| Frontend                                                                                                                         | Backend                                          | Verdict                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST /api/orders` + `clientRequestId/lines/discount/cashReceived` (`services/orders-service.ts`, `models/pos-model.ts:291-313`) | `orders.router.ts:9` + `orders.schemas.ts:15-59` | Match for `external_product` only. `setCartLineQuantity` clamps 1–999 (`pos-model.ts:187-199`) |
| `POST /api/refunds` (`refunds-service.ts`)                                                                                       | `refunds.router.ts:8`, `refunds.schemas.ts`      | Match for current flows; `recipe` stock action is a legacy branch pending §1.8 review          |
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
