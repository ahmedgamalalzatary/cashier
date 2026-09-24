# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-18 (re-verified 2026-09-21 — all ✅ Fixed and ➖ No-action items removed; only ❌ Open items remain)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`
**Method:** 4 parallel sub-agent audits — (1) Spec vs Implementation, (2) Backend correctness, (3) Frontend correctness, (4) Security / Data / Tests / DevOps. All findings verified by file reads. Evidence format `path:line`. Re-verification 2026-09-21: every Fixed/No-action claim re-checked in code; confirmed-fixed and skipped items deleted from this doc.

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

Only ❌ Open items. All ✅ Fixed and ➖ No-action rows were verified on 2026-09-21 and removed.

| ID          | Problem                                                                                        | State  | Evidence / note                                                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2.2        | POS two-level category nav missing                                                             | ❌ Open | `apps/web/src/app/pos/page.tsx:357-375` flat list; `ExternalCategory` (`packages/shared/src/types.ts:434-443`) has no `parentId`, single-equality filter (`models/pos-model.ts:202-216`)                                                   |
| §2.9        | Recipe detailed rules untraced (partial)                                                       | ❌ Open | Yield scaling + atomic prepare + deactivation guard exist (`recipes.service.ts:136,141,170-180,288-335`); missing: edit-future-only, cycle guard, cost-%/margin UI                                                                       |
| §2.12       | PDF export uses browser print only                                                        | ❌ Open | Salary cash-flow and employee history are implemented in `reports.repository.ts` (`cashFlow`, `salaryHistory`); remaining gap is `window.print()` in `reports/page.tsx`, with no PDF library/server download                                                             |
| W1          | Single open shift blocks multi-register                                                        | ❌ Open | `schema.ts:754,768` unique `openSlot`; `shifts.repository.ts:76,111,126,136-141`; `shifts.service.ts:64-65` 409; pinned by `tests/db/shifts.test.ts:81`                                                                                    |
| W2 + E5     | Refund branches for sale types sales never produce (internal `recipe`/`item` POS sales unrestored) | ❌ Open | Sales always `type:"external_product"` (`orders.service.ts:183-198`); refunds validate all three (`refunds.service.ts:169-189`) with restore branches only for `item`/external (`:338-442`, recipe falls through)                         |
| §4 offline  | No offline/queue beyond error banner                                                           | ❌ Open | `web/src/lib/api.ts:29-31` throws only; no offline/queue/cache in `web/src`; POS inline banner only (`pos/page.tsx:312-319`)                                                                                                             |
| §7.1–8      | Concurrency/boundary/race test gaps (partial — some coverage exists)                           | ❌ Open | Missing: over-refund race, consolidated RBAC matrix, concurrent double-submit DB test. Exists: `inventory.test.ts:108`, `refunds.test.ts:283`, `transfers.test.ts:153,339`, `shifts.test.ts:81`, fixed-discount boundary e2e + orders double-spend race (`tests/db/orders.test.ts`) |
| E7          | Low-stock alerting scope (flags only, no push/job)                                             | ❌ Open | Flags `reports.service.ts:76,122-125`, `inventory.service.ts:272-273`; no alert path in `api/src` (worker = catalog refresh only). Spec-dependent                                                                                        |

Removed 2026-09-21 (verified fixed, deleted from report): C1, C2, §2.1, §2.3, §2.10, W3, W4, M1, M1b, M2, §4 RTL padding, §4 cart math, §4 refund draft, §4 refund updater, §4 admin notice, §4 shift polling, §4 waste feedback, §4 receipt RTL, §4 expense order, §4 transfer hint, §4 report dates, S4, S6, D5, E1b, E2, §2.14-3, §2.12-group-2 (stocktake history).
Removed 2026-09-22 (verified fixed, deleted from report): §2.8 salaries/payday, §2.12 groups 3–4 salary reporting, §2.13 salary tables, §4.1 salaries placeholder.
Removed 2026-09-22 (test added, deleted from report): D4-partial — transfers deadlock-retry case now in `apps/api/tests/lib/deadlock-retry.test.ts`; wrapper covered for all 5 wrapped services (categories/orders/purchases/refunds/transfers).
Removed 2026-09-22 (closed, deleted from report): §8 — migrate/cache-worker healthchecks added (`/proc` probes, documented in docker.md Status and health); `NEXT_PUBLIC_API_URL` rebuild coupling documented and accepted in docker.md.
Removed 2026-09-21 (no-action / skipped per owner or intent, deleted from report): §2.14-4, M4, §4 table captions, §7.9, plus previously removed false positives (D1, D3, D6/D7, S1/S2/S5, N1–N5, E3/E4/E6/E1c, old C1–C4, §2.11 refund→waste).
Removed 2026-09-21 (pin tests added, deleted from report): M3-pin, S3-pin, §2.14-1-pin — tests now at `apps/web/tests/shared/recipe-type.test.ts`, `security-docs.test.ts`, `pos-hierarchy.test.ts`.

---

## 0. Executive summary

Biggest verified remaining risks:

- Single open shift system-wide blocks multi-register (`schema.ts:754,768`, `shifts.service.ts:64-65`).
- Refund/sales line-type mismatch is real: sales only produce `external_product`, refunds still branch `item`/`recipe` (internal POS sales unrestored).

---

## 2. Spec vs implementation gaps

Source: `docs/system-specs.md`, `docs/external-products-integration-design.md`, `docs/docker.md`, `README.md` vs `apps/api/src`, `apps/web/src`, `packages/shared/src`.

| #   | Spec module (§)                        | Status                                                      |
| --- | -------------------------------------- | ----------------------------------------------------------- |
| §3  | Categories (main → sub tree)           | ⚠️ Partial — local tree OK; POS two-level nav lost          |
| §9b | Salaries / advances / bonuses / payday | ✅ Implemented                                               |
| §10 | Recipes (prepared/sub-recipes)         | ⚠️ Partial (flow works; detailed rules untraced)            |
| §14b| Reports (6 groups)                     | ✅ Implemented                                               |
| §14c| PDF export                             | ⚠️ Partial (browser print-to-PDF only)                      |
| §15 | Data model                             | ✅ Implemented                                               |

All other spec modules verified implemented (roles, items/FIFO, stocktake, suppliers/purchases, transfers, POS, shifts, employees linkage, waste, refunds, expenses, dashboard, printing, external-products design, docker runbook).

### 2.2 Categories (§3) — ⚠️ Partial

- ✅ Local tree + admin CRUD: `schema.ts:50-60` (`parentId`), `categories.router.ts:6-10`.
- ❌ POS two-level nav missing. POS renders flat external list `apps/web/src/app/pos/page.tsx:357-375` with single-equality filter (`models/pos-model.ts:202-216`). `ExternalCategory` (`packages/shared/src/types.ts:434-443`) has no `parentId`, so there is no data model for a tree. Reports UI still shows main/sub `reports/page.tsx:67-76`.
- **Fix:** map external categories into two-level presentation or formally amend spec.

### 2.8 Employees and payroll (§9) ✅

- ✅ CRUD + grant/revoke (`employees.router.ts:8-13`, `employees.service.ts:55-118`).
- ✅ Monthly payroll is implemented with `salaryAdvances`, `salaryAdjustments`, and `salaryPayments` in `schema.ts` plus migration `0037_worried_moira_mactaggert.sql`.
- ✅ Admin APIs cover monthly listing, advances, adjustments, and payday through `/api/salaries` (`salaries.router.ts`); `apps/web/src/app/salaries/page.tsx` provides the working salaries UI.
- ✅ Salary payments and advances feed cash-flow, and salary payments/advances/adjustments feed employee history through `cashFlow()` and `salaryHistory()` in `reports.repository.ts`.

### 2.9 Recipes (§10) ⚠️ Partial

Local sellables removed by design (not a gap). Prepared/sub work: `POST /:id/prepare` (`recipes.router.ts:14`), FIFO preview (`recipes.service.ts:268-335`), immutable `preparations` + allocations (`schema.ts:624-680`). Present: yield scaling (`recipes.service.ts:170-180`), atomicity via `repo.transaction` (`:136`), deactivation guard (`:141`), cost calc (`:288-335`). Not traced: edit-affects-future-only, cycle guards (only traversal stack, no proven rule), live cost-%/margin UI.

### 2.12 Reports/dashboard/PDF (§14+§2)

- ✅ Dashboard: today sales/refunds/discounts/profit/orders, open shift, low/negative, pending transfers (`reports.service.ts:61-79`, `reports.repository.ts:15-22`).
- ✅ Groups 1 (sales/profit), 5 (waste&refunds), 6 (suppliers) complete; group 2 stocktake history implemented (`reports/page.tsx:144-156`, `reports.repository.ts:132-141`); date-range throughout.
- ✅ Group 3 includes salary payments and advances in cash-flow; group 4 includes salary payment, advance, bonus, and deduction history (`reports.repository.ts`: `cashFlow`, `salaryHistory`; `reports/page.tsx`: employee salary-history table).
- ⚠️ PDF = `window.print()` (`reports/page.tsx:345`). No library/server PDF, no per-report download. Excel correctly absent (§16).

### 2.13 Data model (§15) ✅

All specified core tables are present. Payroll uses `salaryAdvances`, `salaryAdjustments`, and `salaryPayments` in `schema.ts` (database tables `salary_advances`, `salary_adjustments`, and `salary_payments`). Extras remain justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache).

---

## 3. Backend — wrong logic / mismatches

### W1. Only one open shift system-wide [Medium]

`schema.ts:754` `openSlot`, `:768` unique index, `shifts.repository.ts:76` writes `1`, close NULLs `:111`, reopen `:126`, `findCurrent where openSlot=1` `:136-141`, dup → 409 `:64-65`, second cashier blocked. Blocks second cashier sales/refunds/waste/expenses/requests (`orders.service.ts:89-92`, `refunds.service.ts:78-79`, `waste.service.ts:54-57`, `expenses.service.ts:75-76`, `transfers.service.ts:20-22`). Fine single-terminal; blocks multi-register. Pinned by `tests/db/shifts.test.ts:81`. Fix: per-cashier/per-terminal open slot if multi-register needed, else document single-register constraint.

### W2 + E5. Refund handles line types sales never produce [Medium]

Sales always `type:"external_product"` (`orders.service.ts:183-198`, `recipeId/itemId:null`); schema supports `recipe|item|external_product` (`orderLines:862`). Refunds validate all three types (`refunds.service.ts:169-189`); restore branches only for `item` and `external_product` (`:338-442`, recipe falls through with no stock move). Direction 2026-09-19: keep all 3 line types, bring back internal `recipe`/`item` POS sales per amended spec §7/§10 — unrestored, so branches are still dead/mismatched. Fix: restore internal sales or remove/guard the branches; add legacy-data guard.

---

## 4. Frontend audit

**No route-path or payload-shape mismatches found.** See Appendix B.

### 4.1 Broken / missing flows

#### [Low] No offline / retry beyond generic error

- `src/lib/api.ts:29-31` throws "تعذر الاتصال بالخادم". POS `:312-319` (`role="alert"`), warehouse, orders show banner only. No cart persistence/queue (`grep offline|navigator.onLine|indexedDB|serviceWorker|queue` in `web/src` = none). Acceptable if out of scope — document.

Auth correct: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx:47-78`).

---

## 5. Security

No open items (S3-pin closed 2026-09-21 — see removed list).

---

## 6. Data integrity / concurrency

No open items (D4-partial closed 2026-09-22 — transfers deadlock-retry test added; see removed list).

---

## 7. Missing tests

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s) + HTTP/MySQL tests (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts single-slot race, purchases duplicate-invoice race, categories inverse-move deadlock, deadlock-retry per service incl. transfers, stacked discounts, fixed-discount boundary e2e, orders double-spend race, transfer double-approve race (`transfers.test.ts:339`), purchases/transfers replay+mismatch). Web: services/models/architecture/components mapping; shared-contract pins (`tests/shared/`: recipe type ↔ DB enum parity, flat external-category hierarchy, security-docs notes).

Gaps (highest value first):

1. Concurrent refunds over-refund race — two refunds same line racing `refundedQuantities` (`refunds.service.ts:88-118`; `refunds.test.ts:283` covers sequential thirds only).
2. RBAC matrix e2e — cashier blocked `/api/products|/inventory|/purchases|/suppliers|/users` (only spot 403s in users/items/reports/shifts). Products/inventory/purchases/suppliers lack explicit 403 tests. (`/api/expenses` create and `/api/transfers` requests are intentionally cashier-allowed — do not assert 403 there.)

---

## 8. DevOps / config gaps

No open items (2026-09-22: migrate/cache-worker healthchecks added; `NEXT_PUBLIC_API_URL` rebuild coupling documented and accepted in `docker.md` — see removed list).

---

## 9. Forgotten edge cases

| #  | Edge             | Status / Evidence                                                                                                                                                                    | Severity       |
| -- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| E7 | Low-stock alerts | Flags only `isLowStock/isNegativeStock` (`inventory.service.ts:272-273` + `reports.service.ts:76,122-125` + `reports.repository.ts:41`); no push/job/channel (worker = catalog refresh only). Spec-dependent. | Low (spec-dep) |

---

## 10. Priority fix order

1. Resolve sales/refund line-type mismatch (W2 + E5): restore internal `recipe`/`item` POS sales per amended spec §7/§10, or remove/guard dead refund branches.
2. Document single-register constraint or implement per-terminal slots (W1).
3. Add concurrency race test: over-refund (§7.1).
4. Decide POS two-level nav (§2.2): map external categories or amend spec; record recipe detailed rules (§2.9).
5. Reports: decide server-PDF vs print-only (§2.12).
6. Frontend: confirm offline scope + document (§4 offline); decide low-stock alerting scope (E7).

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts:218-220` throw-after-partial safe via rollback.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses/purchases/transfers (C1/D5).
- Duplicate purchase invoice race returns 409 (C1); external-product refunds restock or waste (C2); purchases/transfers idempotency keys (D5); shared deadlock retry (D4 code); stable idempotency fingerprints (M2); recipe waste incl. recipe target (C2/§2.10/E1); stacked-discount math pinned (E2); stocktake + manual adjustment (E1/§2.3); reports guard at mount (§2.1); LIKE escaping (S4); env contract (S6).
- No SQLi: Drizzle params; raw `sql` columns only.
- `api build` builds `@cashier/shared` first (`api/package.json`) — keep.
- `changePassword` bumps `tokenVersion` + re-issues (`auth.repository.ts:26-34`, `auth.service.ts:48-66`); admin resets also bump (`users.repository.ts:51-60`).
- Frontend API shapes match backend (Appendix B); cookie-first + Tauri fallback, 401 clears, route gating correct; RTL padding, cart math, refund draft/updaters, cashier notice, shift polling, waste feedback, receipt RTL, expense order, transfer hint, report dates — all fixed and pinned.

---

## Appendix B. Verification matrix (frontend → backend match)

| Frontend                                                                                                                               | Backend                                            | Verdict                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/orders` + `clientRequestId/lines/discount/cashReceived` (`services/orders-service.ts:69-74`, `models/pos-model.ts:271-293`) | `orders.router.ts:9` + `orders.schemas.ts:15-59`   | Match. `setCartLineQuantity` clamps 1–999 (`pos-model.ts:183-196`) |
| `POST /api/refunds` (`refunds-service.ts:33-38`)                                                                                       | `refunds.router.ts:8`, `refunds.schemas.ts:21-27`  | Match (nullable `stockAction` null for external)                   |
| `GET /api/refunds/order/:orderId/quantities` (`:27-31`)                                                                                | `refunds.router.ts:9`                              | Match                                                              |
| Shifts open/close/admin-close/reopen/correction (`shifts-service.ts:8-42`)                                                             | `shifts.router.ts:9-13`, `shifts.schemas.ts:16-45` | Match                                                              |
| `GET /api/inventory/main\|cafe/stock` (`inventory-service.ts:4-10`)                                                                    | `inventory.router.ts:10-11` (main admin)           | Match; `cafe/page.tsx:67` main only if `isAdmin`                   |
| `PUT /api/auth/password` (`auth-service.ts:31-34`)                                                                                     | `auth.router.ts:19-24`                             | Match                                                              |
| Recipes CRUD + `/active`, `/:id/prepare`, `/preparations*` (`recipes-service.ts:19-61`)                                                | `recipes.router.ts:6-14`                           | Match                                                              |
| Transfers requests/approve/reject/direct (`transfers-service.ts:15-57`)                                                                | `transfers.router.ts:10-16`                        | Match                                                              |
| `POST /api/products/refresh`, `GET /refresh-status`, `PUT /:id/stock-setup` (`products-service.ts:30-50`)                              | `products.router.ts:15-17`                         | Match                                                              |
| `GET /api/reports?from&to`, `/dashboard` (`reports-service.ts:33-38`)                                                                  | `reports.router.ts:8-9`                            | Match                                                              |
