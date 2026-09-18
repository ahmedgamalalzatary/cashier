# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-18 (reviewed same day — false-positive / intended-behavior items removed per verification)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`
**Method:** 4 parallel sub-agent audits — (1) Spec vs Implementation, (2) Backend correctness, (3) Frontend correctness, (4) Security / Data / Tests / DevOps. All findings verified by file reads. Evidence format `path:line`.

> How to use this doc: fix in priority order in §10. Each item has severity, evidence, impact, and suggested fix. Check off as you go.

---

## Table of contents

- [0. Executive summary](#0-executive-summary)
- [1. Critical bugs — fix first](#1-critical-bugs--fix-first)
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
- [Appendix B. Verification matrix](#appendix-b-verification-matrix-frontend--backend-match)

---

## 0. Executive summary

Biggest verified risks:

- `external_product` refunds never restock nor waste ingredients — silent stock leak (`refunds.service.ts:327-338`).
- Duplicate purchase invoice-number race returns 500 instead of 409 (`purchases.service.ts:32-37`).
- Entire modules missing: **salaries/payday** (stub `apps/web/src/app/salaries/page.tsx:1-4`), **stocktake/manual adjustment** (no tables/endpoints/UI).
- Single open shift system-wide blocks multi-register (`schema.ts:707`, `shifts.service.ts:54-58`).
- Deadlock retry only on categories; purchases/orders/refunds/transfers crash under concurrent load.
- No idempotency keys on purchases or transfer-requests — double-click creates duplicates.

---

## 1. Critical bugs — fix first

### C1. Duplicate purchase invoice-number race returns 500 instead of 409 [High]

- `apps/api/src/modules/purchases/purchases.service.ts:32-37` — pre-check `hasInvoiceNumber()` (plain `SELECT`, `purchases.repository.ts:73-85`, no `FOR UPDATE`), then insert.
- `apps/api/src/db/schema.ts:95-99` — unique `purchase_invoices_supplier_number_uidx(supplierId, invoiceNumber)` exists, but `PurchasesService.create` has no `ER_DUP_ENTRY` catch (unlike orders/refunds/waste).

**Impact:** two concurrent same `(supplierId,invoiceNumber)` both pass check; loser gets 500 not intended 409 "رقم الفاتورة مسجل لهذا المورد من قبل".
**Fix:** catch `ER_DUP_ENTRY` → 409, same pattern as orders/refunds/waste.

### C2. External-product refunds never restock ingredients — stock leak [High]

- `apps/api/src/modules/refunds/refunds.service.ts:199-338` — `type==="item"` + `return_to_stock` calls `inventory.receive` (`:279-289`); `type==="external_product"` (`:327-338`) only writes `createReturnAllocation(..., returnedBatchId:null)`, never receives.
- Original sale did `inventory.consume` cafe ingredients (`orders.service.ts:199-209`).
- `refunds.service.ts:311-325` — `not_returnable` item path correctly creates waste; external path does neither restock nor waste.

**Impact:** refunding external-product sale leaves cafe stock permanently deducted (only cost paper-trail kept).
**Fix:** decide: restock ingredients on external refund OR auto-create waste entry (consistent with `not_returnable`). Implement + test.

---

## 2. Spec vs implementation gaps

Source: `docs/system-specs.md`, `docs/external-products-integration-design.md`, `docs/docker.md`, `README.md` vs `apps/api/src`, `apps/web/src`, `packages/shared/src`.

| # | Spec module (§) | Status |
|---|---|---|
| §2 | Roles & permissions matrix | ✅ Implemented |
| §3 | Categories (main → sub tree) | ⚠️ Partial — local tree OK; POS two-level nav lost |
| §4 | Items & FIFO stock | ✅ Implemented except stocktake |
| §4b | Stocktake (جرد) + manual adjustment | ❌ Missing |
| §5 | Suppliers & purchase invoices | ✅ Implemented |
| §6 | Cafe transfers (request → approve) | ✅ Implemented |
| §7 | POS sales | ✅ Implemented |
| §8 | Shifts | ✅ Implemented |
| §9 | Employees linkage | ✅ Implemented |
| §9b | Salaries / advances / bonuses / payday | ❌ Missing (entire sub-module) |
| §10 | Recipes (prepared/sub-recipes) | ⚠️ Partial (flow works; detailed rules untraced) |
| §11 | Waste | ⚠️ Partial (local-recipe target impossible) |
| §12 | Refunds | ✅ Implemented |
| §13 | Expenses | ✅ Implemented (salary auto-feed missing as knock-on) |
| §14a | Dashboard | ✅ Implemented |
| §14b | Reports (6 groups) | ⚠️ Partial (3 of 6 incomplete — salary/stocktake knock-ons) |
| §14c | PDF export | ⚠️ Partial (browser print-to-PDF only) |
| §2 | Printing (80mm, auto-print, reprint) | ✅ Implemented |
| §15 | Data model | ⚠️ Partial (5 tables missing) |
| §16 | Out-of-scope exclusions respected | ✅ Implemented |
| — | External-products integration design | ✅ Implemented |
| — | Docker runbook accuracy | ⚠️ Partial (worker undocumented) |

### 2.1 Roles (§2) — ✅

Enforcement correct at route level:

- POS sale/refund cashier-only: `modules/orders/orders.router.ts:9`, `modules/refunds/refunds.router.ts:8` + exact-match `middleware/auth.ts:97-100`.
- Shifts: `modules/shifts/shifts.router.ts:9-13`, ownership `shifts.service.ts:107`, `current` blocks cross-cashier `:88`, single open via `open_slot` `schema.ts:709` → 409 `:55-56`.
- Transfers: `modules/transfers/transfers.router.ts:9-16`.
- Waste cafe-only: `waste.service.ts:51-58`, list scoped `:203-205`, get 403 `:207-212`.
- Admin-only items/categories/recipes/purchases/suppliers/users/employees: `items.router.ts:10-14`, `app.ts:70-80`; products refresh/stock-setup admin-only (`products.router.ts:15,17`), catalog readable by cashiers (`:14`).
- Reports+dashboard admin: guarded at mount `app.ts:81` (`...adminOnly`), like all sibling modules; `reports.router.ts:4-9` carries no inner guard.
- Cashier↔employee 1-to-1: `shifts.service.ts:28-35`, revoke keeps employee (`employees.service.ts:88-102`).
- Expenses type by role: `expenses.service.ts:71-91`.

### 2.2 Categories (§3) — ⚠️ Partial

- ✅ Local tree + admin CRUD: `schema.ts:50-60` (`parentId`), `categories.router.ts:6-10`.
- ❌ POS two-level nav missing. Spec: main tabs + sub filter row. POS renders flat external list `apps/web/src/app/pos/page.tsx:340-353`. Integration design never addresses local tree POS role — likely omission. Reports UI still shows main/sub `reports/page.tsx:67-76`.
- **Fix:** map external categories into two-level presentation or formally amend spec.

### 2.3 Items/FIFO (§4) ✅; Stocktake (§4b) ❌ Missing

- ✅ Fields, per-warehouse minimums: `schema.ts:123-160`, `components/warehouse/item-form-modal.tsx:216-226`.
- ✅ FIFO batches + ledger + transfer cost carry-over: `stockBatches` `schema.ts:188-218`, `stockMovements` `:953-980`, `transferLines.sourceBatchId/cafeBatchId` `:287-312`; `stockDeficitAllocations` `:984-1008` back-fills negative sales (exceeds spec, good).
- ✅ Purchases create main FIFO batches: `purchases.service.ts:120-125`; immutable (no update/delete in `purchases.router.ts:1-10`).
- ✅ Low/negative flags: `reports.service.ts:73-77`, `warehouse/page.tsx:97-99,267-275`, `cafe/page.tsx:94,121`, `orders/page.tsx:123`.
- ❌ Stocktake + single-item adjustment missing: no `stocktakes`/`stocktake_lines` in `schema.ts`, `inventory.router.ts:1-13` read-only, no جرد page in `apps/web/src/app`. Only `stocktake_surplus` string in `tests/unit/modules/inventory/inventory.service.test.ts:140`.
- **Fix:** session/count/confirm endpoints + adjustment doc, UI in warehouse, history in reports §14-2.

### 2.4 Suppliers & purchases (§5) ✅

Statement + running balance + anytime payments: `suppliers.router.ts:12-13`, `suppliers.service.ts:67-109`, `suppliers.repository.ts:17-21`. No purchase-returns (spec-compliant).

### 2.5 Transfers (§6) ✅

Atomic approve rejects added/dropped lines (`transfers.service.ts:50-85`, esp. `:61-69`); request qty preserved (`transfers.repository.ts:176-180`); shared queue (`transfers.router.ts:9`); direct admin-only (`:15`).

### 2.6 POS (§7) ✅

External-only catalog (per approved design), cash/change + discount caps (`orders.service.ts:130-161`), percent+fixed (`orders.schemas.ts:39-58`), open-shift gate (`:89`), negative allowed + flagged, 80mm receipt (`components/pos/order-receipt.tsx:12-18`), auto-print (`pos/page.tsx:165-171`) + reprint (`orders/detail/page.tsx:87-91`), FIFO snapshots (`orderLineAllocations`, `schema.ts:1010-1035`). Cash-only, takeaway-only (compliant by absence).

### 2.7 Shifts (§8) ✅

Float, linked cashier, 7-metric totals (`shifts.service.ts:72-79`), `expected=float+sales−refunds−expenses` + over/short (`:109-119`), force-close/reopen/correct + `shiftEvents` (`schema.ts:713-743`).

### 2.8 Employees (§9) ✅ linkage / (§9b) ❌ payroll missing

- ✅ CRUD + grant/revoke (`employees.router.ts:8-13`, `employees.service.ts:55-118`).
- ❌ No `salary_advances/adjustments/payments` tables, no routes, web stub `salaries/page.tsx:1-4` + `unfinished-modules.ts:1-7`. `payType/payRate` stored never computed. Knock-ons: cash-flow excludes salaries (`reports.repository.ts:132-138`), employees report no salary history (`:154-160` has hours/actions only).
- **Fix:** 3 tables, advances/bonus-deduction, payday compute+pay, cash-flow inclusion, `/salaries` UI.

### 2.9 Recipes (§10) ⚠️ Partial

Local sellables removed by design (not a gap). Prepared/sub work: `POST /:id/prepare` (`recipes.router.ts:14`), FIFO preview (`recipes.service.ts:268-335`), immutable `preparations` + allocations (`schema.ts:624-680`). Not traced: yield scaling, no-negative atomicity+conflict, edit-affects-future-only, deactivation/cycle guards, live cost-%/margin UI.

### 2.10 Waste (§11) ⚠️ Partial

Item+external targets, FIFO, allocations, stored cost, reason codes, idempotency — verified (`waste.schemas.ts:12-55`, `waste.service.ts:35-201`). Gap: finished local recipe cannot be wasted — schema accepts only `item|external_product` (`:16-26`), service hardcodes `recipeId:null` (`:135-136`), while DB check still permits `targetType='recipe'` (`schema.ts:1128-1165`) = dead branch. Fix: re-add or drop branch/columns.

### 2.11 Refunds (§12) ✅ Verified — no gap

Lookup, whole/partial, over-refund guards, shift attach, `return_to_stock`/`not_returnable` with recipe ingredients consumed (`refunds.service.ts:119-133,161-183`), external allocations (`:227-240`). The “refund also logged as waste” link IS implemented — the `not_returnable` path creates a `waste_entries` row with `refundLineId` set. Former gap claim removed as false positive. (External-product refund stock handling itself is still open — see C2.)

### 2.12 Reports/dashboard/PDF (§14+§2)

- ✅ Dashboard: today sales/refunds/discounts/profit/orders, open shift, low/negative, pending transfers (`reports.service.ts:61-79`, `reports.repository.ts:15-22`).
- ✅ Groups 1 (sales/profit), 5 (waste&refunds), 6 (suppliers) complete; date-range throughout.
- ⚠️ Group 2 missing stocktake history; 3 missing salaries in cash-flow; 4 missing salary history (knock-ons).
- ⚠️ PDF = `window.print()` (`reports/page.tsx:329-331`, `globals.css:233-285`). No library/server PDF, no per-report download. Excel correctly absent (§16).

### 2.13 Data model (§15) ⚠️ Partial

All present except `salary_advances`, `salary_adjustments`, `salary_payments`, `stocktakes`, `stocktake_lines`. Extras justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache).

### 2.14 Other wrong interpretations / leftovers

1. POS hierarchy (§3) replaced without recorded decision in `external-products-integration-design.md` — hierarchy itself is intended; only the decision record is missing.
2. Dead `recipe` waste path — remove or implement.
3. `app.ts:81` vs `reports.router.ts:7` guard placement inconsistent.
4. `docs/docker.md` omits 5th service `cache-worker` (`docker-compose.yml:93-99`, 12h refresh dependency).
5. Cashier main-stock blindness: `cafe/page.tsx:67` fetches main only for admin — acceptable per spec but causes approval friction.

---

## 3. Backend — wrong logic / mismatches

### W1. Only one open shift system-wide [Medium]

`schema.ts:707` unique `open_slot`, `shifts.repository.ts:73-78` writes `1`, close NULLs `:107-119`, dup → 409 `:54-58,220-224`, second cashier sees `{occupied:true}` `:88-90`. Blocks second cashier sales/refunds/waste/expenses/requests (`orders.service.ts:89-92`, `refunds.service.ts:78-79`, `waste.service.ts:54-57`, `expenses.service.ts:75-76`, `transfers.service.ts:20-22`). Fine single-terminal; blocks multi-register. Fix: per-cashier/per-terminal open slot if multi-register needed, else document single-register constraint.

### W2. Refund handles line types sales never produce [Medium]

Sales always `type:"external_product"` (`orders.service.ts:170-185`); refunds branch `item`/recipe (`refunds.service.ts:119,200-204,222-250,276-326`). `item` path `entry.line.itemId!` `:315` safe only because unreachable. Fix: remove branches or allow those sale types; add legacy-data guard.

### W3. External refund proportional cost can over-allocate [Medium]

`refunds.service.ts:227-250` `quantity=cumulativeAllocation-alreadyReturned` with no `min(available,remaining)` cap (vs `item` `:241-243`). `roundDivide` can exceed sold. Audit-only (no stock move `:327-338`) but quantities/costs can exceed sale on rounding. Fix: cap + test boundary.

### W4. Purchases lock ordering not deterministic [Low-Med]

`purchases.service.ts:109-131` `receive` in request order. Contrast `transfers.service.ts:151` sorted, `external-order-line.ts:242-243` sorted. `purchases.repository.ts:63-70` sorts item-lock query only, not receive sequence. Two concurrent same-items different-order → InnoDB deadlock → 500. Fix: sort lines by `itemId` before receive.

### M2. Idempotency fingerprints order-sensitive → false 409s [Medium]

`orders.service.ts:63-73` fingerprints raw `lines` before `normalizeLines:39-56`; `refunds.service.ts:30-41` sorts lines but not modifier/key order; `waste.service.ts:17-18`, `expenses.service.ts:51-53` `JSON.stringify(input)` key-order sensitive. Retry same logical order reordered → 409 “معرّف الطلب مستخدم لبيانات مختلفة” not replay. Fix: canonicalize (sort lines+modifiers, stable stringify).

### M3. Response drift vs `packages/shared` [Medium]

`shared/types.ts:273` `RecipeType="prepared"` vs `schema.ts:319` `"product"|"prepared"`. (RefundLine `grossAmount` resolved: present `shared/types.ts:578`, selected `refunds.repository.ts:240-259`, pinned by test.) Fix: align `RecipeType`.

### M4. Status codes for bad FK in POST body [Low]

Unknown `externalProductId`/`itemId` → 404 (`orders.service.ts:104-110`, `transfers.service.ts:132`, `purchases.service.ts:45`). Conventionally 400/422 for payload refs. Internally consistent — decide consciously, document.

---

## 4. Frontend audit

**No route-path or payload-shape mismatches found.** See Appendix B.

### 4.1 Broken / missing flows

> Resolved: non-cashiers see an explicit cashier-only notice (`refunds/page.tsx:169-173`).

#### [Medium] `/salaries` placeholder in nav (keep — module will be implemented)

- `src/app/salaries/page.tsx:1-4` → `<ComingSoonPage module="salaries" />`, `components/layout/unfinished-modules.ts:1-8`, still in `lib/navigation.ts:12` `adminOnly:true`.
- Decision: keep advertised in nav; implement §2.8 (do not remove).

> Resolved: POS polls the shift every 30s, refetches on focus, and re-checks inside checkout (`pos/page.tsx:167-173,236`).

#### [Low] No offline / retry beyond generic error

- `src/lib/api.ts:29-31` throws “تعذر الاتصال بالخادم”. POS `:218-254`, warehouse, orders show banner only. No cart persistence/queue. Acceptable if out of scope — document.

### 4.2 Wrong implementation

#### [Medium] RTL search padding inverted in POS and Refunds

- Wrong: `pos/page.tsx:329-336` icon `right-4` + `pe-12 ps-4`; `refunds/page.tsx:168-175` icon `right-3` + `pe-11 ps-3` (large padding wrong side → overlap).
- Correct refs: `warehouse/page.tsx:174-181` `pe-3 ps-9` icon `right-3`; `orders/page.tsx:141-148` same.
- Fix: swap to `ps-*` large padding.

> Resolved: cart lines render via the shared decimal-total helper (`cartLineTotal`, `pos/page.tsx:710`).

> Resolved: render + submit read through the `refundDraftEntry` normalizer fed by `chooseOrder`, and the quantity/stock updaters initialize missing entries from it (`refunds/page.tsx:236,254-257,265-270`).

### 4.3 UX / edge gaps

- **[Low] Waste forces cafe for products silently:** `waste/page.tsx:171-176` `setWarehouse("cafe")` on `product:*` even if admin chose `main`. Add feedback.
- **[Low] Table captions missing at call sites:** `components/ui/table.tsx:3-19` now sets `scope="col"` + optional sr-only `<caption>`, but no table passes `caption` yet. Fix: add `caption` per table.
- **[Low] Print CSS pins receipt left in RTL:** `globals.css:263-271` `.receipt-print-root{inset:0 auto auto 0;width:80mm}`. Use `right:0` / `inset-inline-start`.

Auth correct: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx:47-78`).

---

## 5. Security

### 🟡 S3 — CORS non-browser bypass; TRUST_PROXY footgun guarded [Low]

- `app.ts:36-42`, `env.ts:8-47`, `docker-compose.yml:68`. `origin:(o,cb)=>cb(null,!o||includes(o))` — curl/no-Origin always passes (normal CORS, not access control). `secure:req.secure` + `trust proxy` gated by `TRUST_PROXY` (default false, compose true). Mis-set without proxy trusts spoofed `X-Forwarded-Proto`. Correct today. Covered `tests/unit/app/app.test.ts:52`.
- Fix: document CORS ≠ auth.

### 🟢 S4 — SQLi safe; LIKE wildcards escaped [Low]

- External-orders search escapes LIKE wildcards (`external-orders.repository.ts:8-9,52`, pinned by test). Drizzle params throughout; `reports.repository.ts` has no LIKE/text search today (date-range SQL only), so no wildcard handling applies there.

### 🟡 S6 — Env contract gaps [Medium]

- `.env.test:1-3` only `DATABASE_URL/JWT_SECRET/PORT` but `env.ts:22-67` requires `EXTERNAL_ORDERS_*` — integration must inject elsewhere or fail validation.
- `.env.example` is the single template for local + production vars (no separate `.env.production.example` by intent); compose requires `.env.production` + `MYSQL_PASSWORD/ROOT/DATABASE_URL/CORS_ORIGIN/NEXT_PUBLIC_API_URL`.
- Fix: fix `.env.test` contract, document vars.

---

## 6. Data integrity / concurrency

- **D2 (=C2)** external refund stock leak — see §1.
- **🟡 D4 Deadlock retry only categories [Medium]:** `categories.service.ts:11-25` `transactionWithDeadlockRetry` vs bare `repo.transaction` in orders/refunds/transfers/purchases. Locking disciplined (`FOR UPDATE` `orders.repository.ts:62,73,209`, `refunds.repository.ts:38,53,87`, `inventory.repository.ts:104,141,170`, sorted IDs) but concurrent multi-item same-ingredient sales → 1213 → 500 not retried 409. No race tests for double-sale / refund over-refund (`lockOrderLines` correct `refunds.service.ts:110-118` but untested). Fix: extract shared retry wrapper, apply to orders/refunds/transfers/purchases.
- **🟡 D5 Idempotency missing purchases/transfers [Medium]:** orders/refunds/expenses/waste have `clientRequestId`+fingerprint+`ER_DUP_ENTRY` (good); `purchases.service.ts:28-37` only invoiceNumber uniqueness (double-click different/no number → double stock); `transfers.service.ts:14-38,97-112` none (retry → duplicate). `wasteEntries.clientRequestId` nullable-unique (`schema.ts:1076`) permits keyless rows though `waste.schemas.ts:14` requires UUID; `refunds.service.ts:311` omits key → NULL allowed (by design, fragile). Fix: add `clientRequestId`+fingerprint to purchases + transfer requests.
> Removed: D1 (false positive), D3 (intended negative-stock design), D6/D7 (accepted minors).

---

## 7. Missing tests

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s, dockerfile-contract) + integration (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts single-slot race, purchases duplicate-invoice race, categories inverse-move deadlock). Web: services/models/architecture/components mapping.

Gaps (highest value first):

1. Concurrent POS double-spend — two simultaneous sales same cafe batch; assert one 409 + deficit accounting. (`inventory.test.ts:108` covers primitive, not order path.)
2. Concurrent refunds over-refund race — two refunds same line racing `refundedQuantities` (`refunds.service.ts:88-118`).
3. Transfer double-approve race — two `approveRequest`; second must 409 (`transfers.service.ts:52-55` `lockRequest` untested).
4. Idempotency mismatch — same `clientRequestId` + different fingerprint/different cashier → 409 (`assertReplay` only happy-path).
5. Discount boundaries — 100% pct, fixed==subtotal (total 0 cash 0), fixed>subtotal → 400, pct>100 → 400. Schema tests partial; no e2e totals.
6. RBAC matrix e2e — cashier blocked `/api/products|/inventory|/purchases|/suppliers|/users` (only spot 403s in users/items/reports/shifts). Products/inventory/purchases/suppliers lack explicit 403 tests. (`/api/expenses` create and `/api/transfers` requests are intentionally cashier-allowed — do not assert 403 there.)
7. Deadlock-retry orders/refunds — no test (only categories).
8. Purchases/transfers double-submit — no test (no key, see D5); add after fix.
9. Structural (intent): `apps/api/package.json:13` `pnpm test` runs unit only; integration needs live MySQL excluded from default/turbo `test`. No CI / no `.github` by intent — run integration locally against live MySQL with full env instead. Document the local integration command.

---

## 8. DevOps / config gaps

- `docker-compose.yml`, `dockerfile.api`, `dockerfile.web`, `turbo.json`, `api/package.json`, `web/package.json`, `tsconfig.base.json`.
- No `.env.production.example` by intent — `.env.example` is the single template for local + production vars (see S6).
- `migrate` no healthcheck/completion visibility beyond `service_completed_successfully`; `cache-worker` no healthcheck (silent catalog-stall risk). `api` healthcheck `/health` unauthenticated — fine, document public.
- `turbo.json`: `test dependsOn ^build` good; `lint`/`typecheck` no `dependsOn` (fine, but web `lint:"eslint"` no path relies on flat-config defaults — verify lints `src`; api lints `src tests` explicitly).
- `NEXT_PUBLIC_API_URL` baked at build (`dockerfile.web:16-17`, `next.config.ts:25-27`) — change needs rebuild.
- Good: shared-package contract enforced by tests (`dockerfile.test.ts:41-75`), `api build` builds shared first — keep.

---

## 9. Forgotten edge cases

| # | Edge | Status / Evidence | Severity |
|---|---|---|---|
| E1 | Returns/refunds | Prorated + over-refund guards good (`refunds.service.ts:99-183`). But (a) external ingredients never restocked (C2/D2 — fix in §1); (b) `refund_lines` CHECK forces `stockAction` NULL for non-`item` (`schema.ts:946-950`) so recipe/external restock unrecordable. No-exchange accepted (skip). | **High** (a) |
| E2 | Discounts | POS pct/fixed validated (`orders.schemas.ts:39-52`, `orders.service.ts:130-141`); catalog windows per line (`external-order-line.ts:166-178`, `shared/external-discount.ts`). Gap: stacked (catalog% then POS%/fixed) computed independently, no test pinning combined total; modifier extra post-discount verify intent. | Medium |
| E5 | Variants | Only external sizes/modifiers + sellability guards (`external-order-line.ts:96-126`). No internal variants; `recipes.type:product\|prepared` (`schema.ts:319`) vs `shared/types.ts:273` `prepared` only, orders only `external_product` lines — `OrderLine:recipe\|item` (`types.ts:483`) stale. Cleanup+doc. | Low-Med |
| E7 | Low-stock alerts | Flags only `isLowStock/isNegativeStock` (`inventory.service.ts:266-276` + `items.test.ts:235`); `reports.stock()` qty vs minimums. No push/job, no threshold audit. | Low (spec-dep) |

> Removed: E3 (no cafe→main returns — intended), E4 (=D1, false positive), E6 (no expiry/FEFO — intended), E1c (no exchange — skip).

Additional frontend edges (§4.3): waste warehouse override, missing table captions, receipt print RTL.

---

## 10. Priority fix order

1. Resolve external-product refund stock handling (C2/D2/E1a) — restock or auto-waste.
2. Add idempotency keys to purchases + transfers (D5) with race tests; fix purchase duplicate catch (C1); canonicalize idempotency fingerprints (M2).
3. Share deadlock-retry beyond categories + add sales/refund/approve concurrency tests (D4, §7.1-3); sort purchase locks (W4).
4. Build salaries module + stocktake module (§2.8, §2.3); wire salaries into cash-flow + employees report; replace `/salaries` stub.
5. Decide dead `recipe` waste path — remove or implement (§2.10); align shared `RecipeType` drift (M3); cap external-refund proportional cost (W3); document single-register constraint or implement per-terminal slots (W1); record POS-hierarchy decision (§2.14-1).
6. Security/config (kept): document CORS ≠ auth (S3); LIKE escaping verified (S4); fix `.env.test` contract + document vars (S6).
7. DevOps (kept): add `migrate`/`cache-worker` healthchecks; fix `NEXT_PUBLIC_API_URL` rebuild coupling or document it.
8. Frontend (kept): keep `/salaries` nav advertised while §2.8 is built; RTL search padding (POS/Refunds); missing table captions at call sites; waste warehouse feedback; receipt print RTL.
9. Edge cases (kept): pin stacked-discount combined math with test (E2); decide low-stock alerting scope (E7).

> Removed from scope: old C1–C4 (false positives / intended), §2.11 refund→waste (implemented), N1–N5, S1/S2/S5, D1/D3/D6/D7, CI/`.github` (no CI by intent), `.env.production.example` (`.env.example` is the template), pool/tsconfig/pnpm/images notes, E3/E4/E6/E1c, `apps/temp-backend/` (gitignored local clutter).

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts:218-220` throw-after-partial safe via rollback.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses (purchases excepted — C1).
- No SQLi: Drizzle params; raw `sql` columns only.
- `changePassword` bumps `tokenVersion` + re-issues (`auth.repository.ts:26-34`, `auth.service.ts:48-66`); admin resets also bump (`users.repository.ts:51-60`).
- Frontend API shapes match backend (Appendix B); cookie-first + Tauri fallback, 401 clears, route gating correct.

---

## Appendix B. Verification matrix (frontend → backend match)

| Frontend | Backend | Verdict |
|---|---|---|
| `POST /api/orders` + `clientRequestId/lines/discount/cashReceived` (`services/orders-service.ts:69-74`, `models/pos-model.ts:271-293`) | `orders.router.ts:9` + `orders.schemas.ts:15-59` | Match. `setCartLineQuantity` clamps 1–999 (`pos-model.ts:183-196`) |
| `POST /api/refunds` (`refunds-service.ts:33-38`) | `refunds.router.ts:8`, `refunds.schemas.ts:21-27` | Match (nullable `stockAction` null for external) |
| `GET /api/refunds/order/:orderId/quantities` (`:27-31`) | `refunds.router.ts:9` | Match |
| Shifts open/close/admin-close/reopen/correction (`shifts-service.ts:8-42`) | `shifts.router.ts:9-13`, `shifts.schemas.ts:16-45` | Match |
| `GET /api/inventory/main\|cafe/stock` (`inventory-service.ts:4-10`) | `inventory.router.ts:10-11` (main admin) | Match; `cafe/page.tsx:67` main only if `isAdmin` |
| `PUT /api/auth/password` (`auth-service.ts:31-34`) | `auth.router.ts:19-24` | Match |
| Recipes CRUD + `/active`, `/:id/prepare`, `/preparations*` (`recipes-service.ts:19-61`) | `recipes.router.ts:6-14` | Match |
| Transfers requests/approve/reject/direct (`transfers-service.ts:15-57`) | `transfers.router.ts:10-16` | Match |
| `POST /api/products/refresh`, `GET /refresh-status`, `PUT /:id/stock-setup` (`products-service.ts:30-50`) | `products.router.ts:15-17` | Match |
| `GET /api/reports?from&to`, `/dashboard` (`reports-service.ts:33-38`) | `reports.router.ts:8-9` | Match |

