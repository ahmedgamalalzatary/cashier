# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-24 (full re-audit; F2, F5, DOC-TMP retick, then payday skip-month / cents and healthcheck self-match later the same day)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`, `docs/docker.md`, `README.md`, `docs/tmp-xx.md`
**Method:** 5 parallel sub-agent audits — (1) re-verify prior open items, (2) spec vs implementation, (3) backend correctness, (4) frontend correctness, (5) security / data / tests / DevOps. Every finding below was re-checked by file reads. Evidence format `path:line`.

> How to use this doc: fix in priority order in §10. Only open problems are listed. Check off (delete the row/section) as you go.

---

## Table of contents

- [Fix tracker](#fix-tracker)
- [0. Executive summary](#0-executive-summary)
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

| ID          | Problem                                                                                          | State  | Evidence / note                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2 + E5     | Internal POS `recipe`/`item` sales unrestored; refunds still branch those types                  | ❌ Open | Spec §7/§10 (2026-09-19). Sales always `type:"external_product"` (`orders.service.ts:185`, `orders.schemas.ts:15-56`). Refunds still validate all three (`refunds.service.ts:169-189`)                          |
| §2.2        | POS two-level nav missing (internal main/sub + flat external)                                    | ❌ Open | `pos/page.tsx:357-375` flat external chips; `pos-model.ts:202-216`; `ExternalCategory` (`packages/shared/src/types.ts:480-489`) has no `parentId`                                                                |
| §2.9        | Recipe products + live cost-%/margin UI missing (cycle/yield/prepare exist)                      | ❌ Open | API create is `type:"prepared"` only (`recipes.schemas.ts:34`). `RecipeMargin` unused (`recipe-controls.tsx:133-152`). Cycle guard present (`recipes.service.ts:376-415`, `recipes.test.ts:281`)                 |
| B1          | Sales-by-category report drops every live POS sale                                               | ❌ Open | `reports.repository.ts:78-95` inner-joins local `categories` via `recipe_id`/`item_id`, both null on current lines                                                                                              |
| DATA-1      | Concurrent refunds of the same line can over-refund under REPEATABLE READ                        | ❌ Open | Snapshot starts at non-locking `findByClientRequestId` (`refunds.repository.ts:130-139`); later `refundedQuantities` is a non-locking `SUM` (`:92-102`)                                                          |
| B2          | Stocktake surplus on empty/negative stock is stored at cost 0                                    | ❌ Open | `stocktakes.repository.ts:178-185` `currentFifoCost` falls back to `"0.000000"`                                                                                                                                 |
| B3          | Dashboard/report low-stock treats default min 0 as an alert; items list does not                 | ❌ Open | `reports.service.ts:73-77,124-128` vs `inventory.service.ts:270-273` (requires `minimumLevel > 0`)                                                                                                              |
| B4          | Employee worked-hours report counts the closed gap after a shift reopen                          | ❌ Open | Report `TIMESTAMPDIFF(opened_at, closed_at)` (`reports.repository.ts:164-167`); shift screen uses event segments (`shifts.service.ts:314-342`)                                                                  |
| B5          | Multi-item waste locks in catalog order with no deadlock retry                                   | ❌ Open | `waste.service.ts:196-211`; no `transactionWithDeadlockRetry`. Sales lock items by id (`orders.repository.ts` lock path)                                                                                         |
| B6          | Waste “recipe” catalog lists prepared recipes and deducts their formula                          | ❌ Open | `waste.repository.ts:167-197`; `loadRecipeProduct` (`:98-128`) has no `type='product'` filter; only prepared recipes exist                                                                                      |
| B7          | Daily/hourly pay types exist in spec/DB; payday is monthly-only                                  | ❌ Open | Spec §9; `schema.ts:26`; create monthly-only (`employees.schemas.ts:42`); payday 409 (`salaries.service.ts:28-29`); UI wipes daily/hourly on save (`employee-modal.tsx:107-124`)                                |
| B8          | Fully discounted (zero-cash) sales cannot be refunded or restocked                               | ❌ Open | `refunds.service.ts:237-239` 409 when `refundAmount <= 0`; CHECK `refunds_amount_positive_chk` (`schema.ts:1037`)                                                                                               |
| F4          | Reports print English codes for several row types                                                | ❌ Open | `report-table.tsx:7-27` `eventLabels` missing `salary_payment`/`salary_advance`/stocktake/ledger refs; salary history and waste `reason` unmapped (`reports/page.tsx:213,228,243`)                             |
| §2.12       | PDF export uses browser print only                                                               | ❌ Open | `reports/page.tsx:357` `window.print()`; salary cash-flow and employee history exist                                                                                                                             |
| W1          | Single open shift system-wide (spec-aligned; blocks multi-register)                              | ❌ Open | Spec §8 one drawer. Unique `openSlot` `schema.ts:834,848`; 409 `shifts.service.ts:64-65`; pinned `tests/db/shifts.test.ts:81`                                                                                    |
| §7.1–8      | Remaining race/RBAC test gaps                                                                    | ❌ Open | Over-refund race untested (`refunds.test.ts:283` sequential). Purchases/suppliers have no cashier 403 DB tests. Same-`clientRequestId` concurrent replay untested                                               |

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

Biggest verified remaining risks:

- Internal POS sales from the 2026-09-19 spec are still unrestored. The counter sells only `external_product` lines (W2 + E5, §2.2, §2.9).
- The sales-by-category report inner-joins local recipe/item categories, so every current sale is dropped (B1).
- Two overlapping refunds of the same line can both pass the already-refunded check under MySQL REPEATABLE READ (DATA-1).

Previously closed money bugs (duplicate invoice 409, external refund restock, idempotency, deadlock retry, stacked discounts, salaries module, stocktake module) still hold.

---

## 2. Spec vs implementation gaps

Source: `docs/system-specs.md`, `docs/docker.md`, `README.md` vs `apps/api/src`, `apps/web/src`, `packages/shared/src`.

| #    | Spec module (§)                        | Status                                                          |
| ---- | -------------------------------------- | --------------------------------------------------------------- |
| §3   | Categories (main → sub tree)           | ⚠️ Partial — local tree OK; POS two-level nav lost; B1 report   |
| §7   | POS three line types                   | ⚠️ Gap — external catalog only                                  |
| §9b  | Salaries / advances / bonuses / payday | ⚠️ Partial — monthly implemented; daily/hourly unrestored (B7)  |
| §10  | Recipes (prepared/sub-recipes)         | ⚠️ Partial — prepared flow works; product recipes unrestored    |
| §11  | Waste                                  | ⚠️ Partial — item + external work; recipe path hits prepared (B6) |
| §14b | Reports (6 groups)                     | ⚠️ Partial — groups exist; category sales empty (B1); English keys (F4) |
| §14c | PDF export                             | ⚠️ Partial — browser print-to-PDF only                          |
| §15  | Data model                             | ✅ Implemented                                                   |

All other spec modules verified implemented (roles, items/FIFO, stocktake, suppliers/purchases, transfers, shifts, employees linkage, expenses, dashboard, printing, docker runbook). Admin cannot complete POS sales (`requireRole("cashier")` + POS banner). Cashiers cannot open reports.

### 2.2 Categories (§3) — ⚠️ Partial

- ✅ Local tree + admin CRUD: `schema.ts:129-139` (`parentId`), `categories.router.ts`.
- ❌ POS two-level nav missing. POS renders a flat external list `apps/web/src/app/pos/page.tsx:357-375` with single-equality filter (`models/pos-model.ts:202-216`). `ExternalCategory` (`packages/shared/src/types.ts:480-489`) has no `parentId`. Reports UI still shows main/sub columns (`reports/page.tsx:67-76`) and currently prints empty for live sales (see B1).
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

- ✅ Dashboard: today sales/refunds/discounts/profit/orders, open shift, low/negative, pending transfers (`reports.service.ts:61-79`, `reports.repository.ts:15-22`).
- ✅ Groups 1 (by day/product/shift/cashier), 5 (waste&refunds), 6 (suppliers) return data; group 2 stocktake history (`reports/page.tsx:144-156`, `reports.repository.ts:132-141`); date-range throughout.
- ✅ Group 3 includes salary payments and advances in cash-flow; group 4 includes salary history (`reports.repository.ts` `cashFlow`, `salaryHistory`).
- ❌ Group 1 by category is empty for live external sales (B1).
- ⚠️ PDF = `window.print()` (`reports/page.tsx:357`). No library/server PDF, no per-report download. Excel correctly absent (§16).

### 2.13 Data model (§15) ✅

All specified core tables are present. Payroll uses `salaryAdvances`, `salaryAdjustments`, and `salaryPayments` in `schema.ts`. Extras remain justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache).

---

## 3. Backend — wrong logic / mismatches

### W2 + E5. Refund handles line types sales never produce [High]

Sales always `type:"external_product"` (`orders.service.ts:185`, `recipeId/itemId:null`); `orderInput` accepts only that type (`orders.schemas.ts:15-56`). Schema still allows `recipe|item|external_product` (`orderLines` `schema.ts:942`). Refunds validate all three types (`refunds.service.ts:169-189`); restore branches only for `item` and `external_product` (`:338-442`; recipe falls through with cash only). Direction 2026-09-19: keep all 3 line types and bring back internal POS sales per amended spec §7/§10. Fix: restore internal sales, or remove/guard the dead branches and amend the spec.

### W1. Only one open shift system-wide [Medium — spec-aligned]

`schema.ts:834` `openSlot`, `:848` unique index, `shifts.repository.ts:76` writes `1`, close NULLs `:111`, reopen `:126`, `findCurrent where openSlot=1` `:136-141`, dup → 409 `:64-65`. Second cashier is blocked from sales/refunds/waste/expenses/requests (`orders.service.ts:102-105`, `refunds.service.ts:128-129`, `waste.service.ts:61-63`, `expenses.service.ts:78-79`, `transfers.service.ts:41-45`). Spec §8 already says one open shift (single drawer). Keep on the tracker until the owner either documents single-register as final or asks for per-cashier/per-terminal slots. Pinned by `tests/db/shifts.test.ts:81`.

### B1. Category sales report drops every current POS sale [High]

`salesByCategory` (`reports.repository.ts:78-95`) inner-joins `categories` on `COALESCE(recipe.category_id, item.category_id)`. Current order lines have both FKs null, so the join drops them (sales and refunds). Spec §3 also asks external sales to group by external category; this query never reads `external_categories`. Admin sees an empty “حسب التصنيف” table while day/product reports still show numbers. Fix: union local recipe/item grouping with `order_lines.external_product_id → external_categories`. Add a test that sells an external product and expects a category row.

### B2. Stocktake surplus at cost 0 when no batch remains [Medium]

Surplus uses “current FIFO cost” from the oldest batch with `remaining_quantity > 0` (`stocktakes.repository.ts:178-185`). Empty or fully negative stock returns `"0.000000"` and still creates a batch (`stocktakes.service.ts:139-149`). Found extra stock is valued as free; later sales of that surplus show no COGS. Fix: use last known batch cost (including remaining 0), or 409 and require a manual cost.

### B4. Worked-hours report counts the closed gap after reopen [Medium]

Shift detail sums open segments from `shift_events` (`shifts.service.ts:314-342`). The employees report uses `TIMESTAMPDIFF` from `opened_at` to `closed_at` (`reports.repository.ts:164-167`). After admin reopen, that interval includes the time the drawer was closed, so payroll hours overstate cashier time. Fix: compute report minutes from the same event segments, clipped to the report range.

### B5. Multi-item waste locks in catalog order with no deadlock retry [Medium]

Each `inventory.consume` locks the item then its batches (`waste.service.ts:196-211`). Recipe ingredients are ordered by `recipe_ingredients.id` (`waste.repository.ts:117-127`); external ingredients keep catalog order. `transactionWithDeadlockRetry` is unused in waste (it wraps categories/orders/purchases/refunds/transfers). Concurrent cafe waste and a sale of overlapping items can deadlock; MySQL rolls back waste and the API returns 500. Fix: pre-lock waste item IDs `ORDER BY id FOR UPDATE` and wrap create in `transactionWithDeadlockRetry`.

### B6. Recipe waste targets prepared production recipes [Medium]

Spec §11 waste of a finished recipe product deducts that drink’s ingredients. The only recipes this API creates are `prepared` (`recipes.schemas.ts:34`). `listCatalogRecipes` lists every active recipe (`waste.repository.ts:167-197`); `loadRecipeProduct` (`:98-128`) does not require `type='product'`. Choosing a syrup/prep recipe consumes the formula ingredients and leaves the prepared output batch in cafe stock. Fix: catalog only `type='product'` as recipe-waste, or hide the recipe target until W2 lands; waste prepared goods as items.

### B7. Daily/hourly employees can be stored and never paid [Medium]

Spec §9 payday is `net = computed pay + bonuses − deductions − advances` for monthly/daily/hourly. Schema enum still has all three (`schema.ts:26`). Create is monthly-only (`employees.schemas.ts:42`); update still allows `daily`/`hourly` (`:67`). Payday 409s unless monthly (`salaries.service.ts:28-29`). The web form warns and clears legacy daily/hourly on save (`employee-modal.tsx:107-124`). Fix: implement daily/hourly computed pay (hourly from cashier shift minutes), or reject those types on update and amend spec §9 to monthly-only.

### B8. Fully discounted sales cannot be refunded [Medium]

After discount allocation, a 100% discounted order has `total = 0`, so computed refund cash is 0 and create throws 409 (`refunds.service.ts:237-239`). CHECK `refunds_amount_positive_chk` (`schema.ts:1037`) would also reject `amount = 0`. Stock return is tied to creating that refund document, so unopened goods cannot go back through this flow. Fix: allow a zero-cash refund when quantity remains, relax the CHECK, and add a 100%-discount restock test.

---

## 4. Frontend audit

**No route-path or payload-shape mismatches found in the flows that exist.** See Appendix B. Internal `recipe`/`item` order payloads are absent on purpose today (W2).

### 4.1 Broken / missing flows

#### [Medium] Reports print English codes (F4)

`eventLabels` in `report-table.tsx:7-20` covers `sale`/`refund`/`expense`/`supplier_payment` and some stock movements. Cash-flow emits `salary_payment` and `salary_advance` (`reports.repository.ts:151-152`). Ledger uses `stocktake_shortage`/`stocktake_surplus`, `purchase_invoice`, `preparation`, `stocktake`, `transfer`. Stocktake history `kind` uses `kind: "event"` (`reports/page.tsx:149`) so `stocktake`/`manual` print as English. Salary history `type` has no mapper (`reports/page.tsx:213`). Waste `reason` is the English enum (`reports/page.tsx:228,243`); the waste page already maps those reasons (`waste/page.tsx:26-32`). Fix: extend `eventLabels` (or dedicated maps) for every cash-flow type, movement, reference, stocktake kind, salary-history type, and waste reason.

#### [Medium] Stocktake confirm reuses the start note (F8)

One `note` state covers start, counts, and confirm (`stocktakes/page.tsx:37,88-90,103`). Confirm requires `note.trim()`. An optional start note silently satisfies the اعتماد reason. Fix: separate start note from confirm reason.

Auth remains correct: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx`). Admin can open `/pos` and sees “المدير لا يسجل مبيعات”; checkout is cashier-only. Cashiers cannot open `/reports`.

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

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s) + HTTP/MySQL tests (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts single-slot race, purchases duplicate-invoice race, categories inverse-move deadlock, deadlock-retry per wrapped service, stacked discounts, fixed-discount boundary e2e, orders double-spend race, transfer double-approve race, purchases/transfers sequential replay). Web: services/models/components mapping.

Gaps (highest value first):

1. Concurrent refunds over-refund race — two refunds of the same remaining unit (`Promise.all`). This is the test for DATA-1; `refunds.test.ts:283` covers sequential thirds only.
2. RBAC matrix e2e — cashier 403 on `/api/purchases` and `/api/suppliers`. Spot 403s exist for users/items/reports/shifts/employees/recipes; products refresh/stock-setup and inventory **main**. Do not assert 403 on `GET /api/products` or `GET /api/inventory/cafe/stock` (cashier-allowed). `/api/expenses` create and `/api/transfers` requests are cashier-allowed.
3. Concurrent double-submit of the same `clientRequestId` (purchases/refunds) — sequential replay exists; the concurrent purchases test uses two different UUIDs to hit the invoice unique index.
4. Category sales with a real external-product order (B1).
5. Surplus on zero stock (B2); 100% discount refund (B8).

`apps/web/tests/architecture/*` still greps page source. `apps/web/tests/shared/` is empty (old pin files gone). `apps/api/tests/docs/` is empty. Prefer service/component tests over new file-contract tests.

---

## 8. DevOps / config gaps

Docker healthchecks and `NEXT_PUBLIC_API_URL` rebuild coupling match `docs/docker.md`. `migrate` and `cache-worker` probes call `scripts/process-liveness.cjs` and ignore their own process. Five Compose services (web :3010, api :4010, mysql, migrate, cache-worker) match the runbook. README local `pnpm dev` ports 3000/4000 are the local-dev cheat sheet. `docs/tmp-xx.md` was reticked 2026-09-24 against current code.

---

## 9. Forgotten edge cases

| #   | Edge                         | Status / Evidence                                                                                                                                                          | Severity |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B3  | Low-stock min 0              | Dashboard/report `quantity <= minimumLevel` (`reports.service.ts:73-77,124-128`). Items list requires `minimumLevel > 0` (`inventory.service.ts:270-273`). Default min is `"0"` (`schema.ts:228-238`). Home card counts `data.stock.length` (`admin-metrics.tsx:63-66`). | Medium   |
| B8  | Zero-cash refund             | See §3 B8.                                                                                                                                                                 | Medium   |

---

## 10. Priority fix order

1. Close concurrent over-refund (DATA-1) and add the race test (§7.1).
2. Make sales-by-category include live external sales (B1).
3. Resolve internal POS sales (W2 + E5 / §2.2 / §2.9): restore `recipe`/`item` lines per spec §7/§10, or amend the spec and remove dead refund/recipe-waste branches (B6 follows that decision).
4. Stop zero-cost surplus batches (B2); allow restock of fully discounted sales (B8).
5. Stable waste locks + deadlock retry (B5); align low-stock rules (B3); fix worked-hours after reopen (B4).
6. Arabic report labels (F4); monthly-only vs daily/hourly (B7).
7. Document single-register (W1) or implement per-terminal slots; decide server-PDF vs print-only (§2.12).
8. Remaining tests: purchases/suppliers 403, same-UUID concurrent replay (§7).

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside a single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts` throw-after-partial is rollback-safe.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses/purchases/transfers (C1/D5). Fingerprints use `request-fingerprint.ts` (M2).
- Duplicate purchase invoice race returns 409 (C1); external-product refunds restock or waste (C2); purchases/transfers lock items in ID order (W4); shared deadlock retry on five services (D4); recipe waste path exists for whatever recipes are stored (C2/§2.10); stacked-discount math pinned (E2); stocktake + manual adjustment module exists (E1/§2.3); blank stocktake counts rejected as missing (F2); POS size buttons match discounted tile/cart (F5); reports admin-guarded at mount (§2.1); LIKE search escaping (S4); env contract (S6).
- Recipe prepare: yield scaling, atomic consume, cycle reject, deactivation guards.
- Monthly payroll, advances, bonuses/deductions, payday net formula in integer cents, skip-month payday blocked, salary rows in cash-flow and employee history.
- Transfer approve rejects add/drop lines; quantity edits allowed.
- Shift expected cash: `float + sales − refunds − shift expenses` (`shifts.service.ts:131-135`).
- Cache refresh `markSuccess` preserves a newer in-flight request.
- No SQLi: Drizzle params; raw `sql` columns only.
- `api build` builds `@cashier/shared` first (`api/package.json`) — keep.
- `changePassword` bumps `tokenVersion` + re-issues (`auth.repository.ts:26-34`, `auth.service.ts:48-66`); admin resets also bump (`users.repository.ts:51-60`).
- Frontend API shapes match backend for the implemented flows (Appendix B); cookie-first + Tauri fallback, 401 clears, cashier cannot open admin routes; RTL padding, cart math, refund draft/updaters, cashier notice, shift polling, waste cafe notice, receipt RTL, expense order, transfer hint, report dates — still in place.
- Docker: five services, healthchecks via `scripts/process-liveness.cjs` (probe ignores itself), `docs/docker.md` matches Compose. `docs/tmp-xx.md` reticked 2026-09-24.

---

## Appendix B. Verification matrix (frontend → backend match)

| Frontend                                                                                                                               | Backend                                            | Verdict                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/orders` + `clientRequestId/lines/discount/cashReceived` (`services/orders-service.ts`, `models/pos-model.ts:291-313`)       | `orders.router.ts:9` + `orders.schemas.ts:15-59`   | Match for `external_product` only. `setCartLineQuantity` clamps 1–999 (`pos-model.ts:187-199`) |
| `POST /api/refunds` (`refunds-service.ts`)                                                                                             | `refunds.router.ts:8`, `refunds.schemas.ts`        | Match (nullable `stockAction` null for recipe; required for item/external) |
| `GET /api/refunds/order/:orderId/quantities`                                                                                           | `refunds.router.ts`                                | Match                                                              |
| Shifts open/close/admin-close/reopen/correction (`shifts-service.ts`)                                                                  | `shifts.router.ts:9-13`, `shifts.schemas.ts`       | Match                                                              |
| `GET /api/inventory/main\|cafe/stock` (`inventory-service.ts`)                                                                         | `inventory.router.ts:10-11` (main admin)           | Match; cafe page main only if `isAdmin`                            |
| `PUT /api/auth/password` (`auth-service.ts`)                                                                                           | `auth.router.ts`                                   | Match                                                              |
| Recipes CRUD + `/active`, `/:id/prepare`, `/preparations*` (`recipes-service.ts`)                                                      | `recipes.router.ts`                                | Match; create body is `prepared` only                              |
| Transfers requests/approve/reject/direct (`transfers-service.ts`)                                                                      | `transfers.router.ts`                              | Match; approve cannot add/drop lines                               |
| `POST /api/products/refresh`, `GET /refresh-status`, `PUT /:id/stock-setup` (`products-service.ts`)                                    | `products.router.ts:15-17`                         | Match; list/refresh-status are cashier-readable                    |
| `GET /api/reports?from&to`, `/dashboard` (`reports-service.ts`)                                                                        | `reports.router.ts:8-9`                            | Match                                                              |
| Salaries month/preview/advance/adjustment/pay (`salaries-service.ts`)                                                                  | `salaries.router.ts`                               | Match; payday monthly-only (B7); month on/before latest paid is not payable |
| Stocktakes start/counts/confirm/manual (`stocktakes-service.ts`)                                                                       | `stocktakes.router.ts`                             | Match; blank counts rejected as missing                            |
