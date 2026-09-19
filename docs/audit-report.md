# Cashier + Warehouse — Codebase Audit Report

**Date:** 2026-09-18 (reviewed same day — false-positive / intended-behavior items removed per verification)
**Scope:** `apps/api` (Express + Drizzle + MySQL), `apps/web` (Next.js Arabic RTL), `packages/shared`, `docker-compose.yml` / Dockerfiles, `docs/system-specs.md`
**Method:** 4 parallel sub-agent audits — (1) Spec vs Implementation, (2) Backend correctness, (3) Frontend correctness, (4) Security / Data / Tests / DevOps. All findings verified by file reads. Evidence format `path:line`.

> How to use this doc: fix in priority order in §10. Each item has severity, evidence, impact, and suggested fix. Check off as you go. Fixed/unfixed state for every item: see Fix tracker.

---

## Table of contents

- [Fix tracker](#fix-tracker)
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

## Fix tracker

Every problem/bug in this report with its current state. States: ✅ Fixed (verified in code + pinned by test) · ❌ Open · ➖ No action (intended, accepted, or false positive).

| ID | Problem | State | Evidence / note |
|---|---|---|---|
| C1 | Duplicate purchase invoice-number race returns 500 not 409 | ✅ Fixed | `purchases.service.ts` maps `ER_DUP_ENTRY` to 409 Arabic message; pinned by `purchases.service.test.ts` |
| C2 | External-product refunds never restock ingredients (stock leak) | ✅ Fixed | `refunds.service.ts` restocks `return_to_stock` ingredients and wastes `not_returnable`; pinned by `refunds.test.ts` |
| §2.1 | Reports guard placement | ✅ Fixed | Guard at mount `app.ts:81`, covered by test |
| §2.2 | POS two-level category nav missing | ❌ Open | — |
| §2.3 | Stocktake + manual adjustment missing | ❌ Open | No tables/endpoints/UI |
| §2.8 | Salaries/advances/payday missing | ❌ Open | Stub kept advertised in nav |
| §2.9 | Recipe detailed rules untraced | ❌ Open | Yield/atomicity/deactivation etc. |
| §2.10 | Dead `recipe` waste path | ✅ Fixed | Recipe waste implemented: `waste.schemas.ts` recipe variant, `waste.service.ts` cafe-only branch scaling `recipe_ingredients`, `waste.repository.ts:loadRecipeProduct/listCatalogRecipes`, web recipe picker + cafe-force; pinned by schema/service/MySQL + `waste-target.test.ts` |
| §2.12 | Report groups 2–4 knock-ons; PDF via print only | ❌ Open | — |
| §2.13 | 5 tables missing (`salary_*`, `stocktake*`) | ❌ Open | — |
| §2.14-1 | POS hierarchy decision unrecorded | ✅ Fixed | `system-specs.md` §3+§7: flat external catalog by design, local main/sub for warehouse/reports; pinned by `pos-hierarchy.test.ts` |
| §2.14-3 | `docker.md` omits `cache-worker` | ✅ Fixed | Fifth service listed in `docs/docker.md` |
| §2.14-4 | Cashier main-stock blindness | ➖ No action | Accepted per spec |
| W1 | Single open shift blocks multi-register | ❌ Open | Document constraint or implement slots |
| W2 | Refund branches for sale types never produced | ❌ Open — direction changed 2026-09-19: branches become live once internal `recipe`/`item` sales return; keep, do not delete |
| W3 | External refund proportional cost can over-allocate | ✅ Fixed | Per-item remaining budget; `refunds.share.test.ts` |
| W4 | Purchase lock ordering not deterministic | ✅ Fixed | Receive/createLine sorted by `itemId`; pinned by `purchases.service.test.ts` |
| M1 | Waste schemas reject numeric strings | ✅ Fixed | `z.coerce` parity + test |
| M1b | Waste schemas accepted booleans as 0/1 | ✅ Fixed | `coerceStrictNumber` + test |
| M2 | Idempotency fingerprints order-sensitive | ✅ Fixed | Stable stringify + sorted lines; expenses/orders/waste unit tests |
| M3 | `RecipeType` drift vs DB | ✅ Fixed | `shared/types.ts` `RecipeType = "product" \| "prepared"` matches DB enum; pinned by type-contract test `apps/web/tests/shared/recipe-type.test.ts` |
| M4 | Bad-FK status codes (404 vs 400/422) | ➖ No action | Kept 404 by intent for URL + body IDs; documented in `middleware/error.ts:4-13` |
| §4 salaries nav | `/salaries` placeholder | ➖ No action | Keep advertised; implement §2.8 |
| §4 offline | No offline/queue beyond error banner | ❌ Open | Confirm scope + document |
| §4 RTL padding | Search padding inverted (POS/Refunds) | ✅ Fixed | `ps-12`/`ps-11` + test |
| §4 cart math | Cart line float math vs exact totals | ✅ Fixed | `cartLineTotal` + test |
| §4 refund draft | Draft dereference without guard | ✅ Fixed | Normalizer + test |
| §4 refund updater | Updaters dropped `stockAction`/`refundedQuantity` on desync | ✅ Fixed | Init from normalizer + test |
| §4 admin notice | Bare log instead of cashier-only message | ✅ Fixed | Notice + test |
| §4 shift polling | Shift state fetched once, goes stale | ✅ Fixed | 30s poll + focus + checkout re-check + test |
| §4 waste feedback | Cafe warehouse forced silently | ✅ Fixed | Status notice when product waste forces cafe; `waste-target.test.ts` |
| §4 table captions | No `scope`/no `caption` | ➖ No action | Skipped per owner — not needed |
| §4 receipt RTL | Receipt pinned physically left | ✅ Fixed | `inset-inline-start` + test |
| §4 expense order | Form cleared before reload | ✅ Fixed | Clear after `await load()` + test |
| §4 transfer hint | Dead submit on invoice tab, no hint | ✅ Fixed | Hint text + disabled submit + test |
| §4 report dates | Empty/inverted dates hit API | ✅ Fixed | `isReportRangeReady` + test |
| S3 | CORS ≠ auth undocumented; `TRUST_PROXY` footgun | ✅ Fixed | `docker.md` CORS ≠ auth + curl/no-Origin + `TRUST_PROXY`/`X-Forwarded-Proto`; pinned by `security-docs.test.ts` |
| S4 | LIKE wildcards unescaped | ✅ Fixed | `escapeLike` + test; reports repo has no LIKE search |
| S6 | `.env.test` contract gaps | ✅ Fixed | Root `.env.test` includes `EXTERNAL_ORDERS_*`; `env.test.ts` parses it as complete |
| D4 | Deadlock retry only on categories | ✅ Fixed | Shared `apps/api/src/lib/deadlock-retry.ts` applied to orders/refunds/purchases/transfers/categories (incl. `categories.create` gap); unit retry tests in `tests/lib/deadlock-retry.test.ts`; §7 race tests still open |
| D5 | No idempotency keys on purchases/transfers | ✅ Fixed | `client_request_id` + fingerprint on invoices/requests (`0035_purchases_transfers_idempotency.sql`); replay + mismatch tests |
| §7.1–8 | Concurrency/boundary/race test gaps | ❌ Open | Add after fixes |
| §7.9 | Unit-only default test; no CI | ➖ No action | By intent; run integration locally |
| §8 | Migrate/worker healthchecks; `NEXT_PUBLIC_API_URL` rebuild coupling | ❌ Open | — |
| E1b | `stockAction` NULL CHECK blocks recipe/external restock records | ✅ Fixed | CHECK allows `stock_action` on item/external (`schema.ts`); backfill `not_returnable` in `0034_relax_refund_action_type_chk.sql` |
| E2 | Stacked catalog+POS discounts untested combined | ✅ Pinned | `tests/orders/stacked-discounts.test.ts` pins catalog% → extra full-price → POS %/fixed combined math + half-up rounding |
| E5 | Internal variants cleanup + stale `OrderLine` types | ❌ Open — direction changed 2026-09-19: keep all 3 line types, bring back internal `recipe`/`item` POS sales per amended spec §7/§10 |
| E7 | Low-stock alerting scope | ❌ Open | Spec-dependent |

## 0. Executive summary

Biggest verified remaining risks:

- Entire modules missing: **salaries/payday** (stub `apps/web/src/app/salaries/page.tsx:1-4`), **stocktake/manual adjustment** (no tables/endpoints/UI).
- Single open shift system-wide blocks multi-register (`schema.ts:707`, `shifts.service.ts:54-58`).
- Shared deadlock retry is fixed across orders/refunds/purchases/transfers/categories; only the §7 race tests remain open.

Recently closed (C1/C2/D5): duplicate invoice race now 409; external-product refunds restock or waste; purchases/transfers have idempotency keys.

---

## 1. Critical bugs — fix first

### C1. Duplicate purchase invoice-number race returns 500 instead of 409 [✅ Fixed]

- Pre-check `hasInvoiceNumber()` still exists; unique `purchase_invoices_supplier_number_uidx(supplierId, invoiceNumber)` remains.
- **Fix verified:** `PurchasesService.create` catches `ER_DUP_ENTRY` and returns 409 `"رقم الفاتورة مسجل لهذا المورد من قبل"` when the loser is a duplicate invoice (not an idempotent replay). Evidence: `purchases.service.ts` `isDuplicateEntry` + catch; pinned by `purchases.service.test.ts`.

### C2. External-product refunds never restock ingredients — stock leak [✅ Fixed]

- Original sale still `inventory.consume` cafe ingredients.
- **Fix verified:** `type==="external_product"` + `return_to_stock` calls `inventory.receive` and stores `returnedBatchId`; `not_returnable` writes a waste entry (`targetType: "external_product"`). Evidence: `refunds.service.ts`; pinned by `refunds.test.ts` (restock + waste cases).

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
| §11 | Waste | ✅ Implemented |
| §12 | Refunds | ✅ Implemented |
| §13 | Expenses | ✅ Implemented (salary auto-feed missing as knock-on) |
| §14a | Dashboard | ✅ Implemented |
| §14b | Reports (6 groups) | ⚠️ Partial (3 of 6 incomplete — salary/stocktake knock-ons) |
| §14c | PDF export | ⚠️ Partial (browser print-to-PDF only) |
| §2 | Printing (80mm, auto-print, reprint) | ✅ Implemented |
| §15 | Data model | ⚠️ Partial (5 tables missing) |
| §16 | Out-of-scope exclusions respected | ✅ Implemented |
| — | External-products integration design | ✅ Implemented |
| — | Docker runbook accuracy | ✅ Implemented |

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
- ❌ Stocktake + single-item adjustment missing: no `stocktakes`/`stocktake_lines` in `schema.ts`, `inventory.router.ts:1-13` read-only, no جرد page in `apps/web/src/app`. Only `stocktake_surplus` string in `tests/inventory/inventory.service.test.ts:140`.
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

### 2.10 Waste (§11) ✅ Fixed

Item+external+recipe targets, FIFO, allocations, stored cost, reason codes, idempotency, strict numeric coercion (booleans rejected — `coerceStrictNumber`, pinned by test) — verified (`waste.schemas.ts:11-70`, `waste.service.ts:35-201`). Recipe waste is implemented: schema recipe variant, service cafe-only branch scaling `recipe_ingredients`, `waste.repository.ts:loadRecipeProduct/listCatalogRecipes`, web recipe picker + cafe-force; pinned by schema/service/MySQL + `waste-target.test.ts`.

### 2.11 Refunds (§12) ✅ Verified — no gap

Lookup, whole/partial, over-refund guards, shift attach, `return_to_stock`/`not_returnable` with recipe ingredients consumed (`refunds.service.ts:119-133,161-183`), external allocations (`:227-240`). The “refund also logged as waste” link IS implemented — the `not_returnable` path creates a `waste_entries` row with `refundLineId` set. Former gap claim removed as false positive. External-product refund stock handling is ✅ Fixed (C2).

### 2.12 Reports/dashboard/PDF (§14+§2)

- ✅ Dashboard: today sales/refunds/discounts/profit/orders, open shift, low/negative, pending transfers (`reports.service.ts:61-79`, `reports.repository.ts:15-22`).
- ✅ Groups 1 (sales/profit), 5 (waste&refunds), 6 (suppliers) complete; date-range throughout.
- ⚠️ Group 2 missing stocktake history; 3 missing salaries in cash-flow; 4 missing salary history (knock-ons).
- ⚠️ PDF = `window.print()` (`reports/page.tsx:329-331`, `globals.css:233-285`). No library/server PDF, no per-report download. Excel correctly absent (§16).

### 2.13 Data model (§15) ⚠️ Partial

All present except `salary_advances`, `salary_adjustments`, `salary_payments`, `stocktakes`, `stocktake_lines`. Extras justified (`order_line_modifiers`, deficit/refund allocations, external catalog cache).

### 2.14 Other wrong interpretations / leftovers

1. POS hierarchy (§3) replaced without recorded decision in `external-products-integration-design.md` — hierarchy itself is intended; only the decision record is missing.
2. Dead `recipe` waste path — ✅ Fixed (see §2.10).
3. `docs/docker.md` lists 5th service `cache-worker` (`docker-compose.yml` `cache-worker`, 12h refresh dependency). ✅ Fixed.
4. Cashier main-stock blindness: `cafe/page.tsx:67` fetches main only for admin — acceptable per spec but causes approval friction.

---

## 3. Backend — wrong logic / mismatches

### W1. Only one open shift system-wide [Medium]

`schema.ts:707` unique `open_slot`, `shifts.repository.ts:73-78` writes `1`, close NULLs `:107-119`, dup → 409 `:54-58,220-224`, second cashier sees `{occupied:true}` `:88-90`. Blocks second cashier sales/refunds/waste/expenses/requests (`orders.service.ts:89-92`, `refunds.service.ts:78-79`, `waste.service.ts:54-57`, `expenses.service.ts:75-76`, `transfers.service.ts:20-22`). Fine single-terminal; blocks multi-register. Fix: per-cashier/per-terminal open slot if multi-register needed, else document single-register constraint.

### W2. Refund handles line types sales never produce [Medium]

Sales always `type:"external_product"` (`orders.service.ts:170-185`); refunds branch `item`/recipe (`refunds.service.ts:119,200-204,222-250,276-326`). `item` path `entry.line.itemId!` `:315` safe only because unreachable. Fix: remove branches or allow those sale types; add legacy-data guard.

### W3. External refund proportional cost can over-allocate [✅ Fixed]

External refunds now share a per-ingredient remaining budget (`planExternalRefundQuantities`) so per-batch rounding cannot exceed that ingredient's proportional remainder. Pinned by `refunds.share.test.ts`.

### W4. Purchases lock ordering not deterministic [✅ Fixed]

Item locks were already `ORDER BY id`. Stock `receive` now also walks lines sorted by `itemId` (`purchases.service.ts`). Pinned by `purchases.service.test.ts`.

### M2. Idempotency fingerprints order-sensitive → false 409s [✅ Fixed]

Shared `requestFingerprint` stable-stringifies objects. Orders hash `normalizeLines` sorted by product; refunds/purchases/transfers sort line ids; waste/expenses hash canonical fields. Pinned by expenses/orders/waste unit tests.

### M3. Response drift vs `packages/shared` [Medium]

~~`shared/types.ts` `RecipeType="prepared"` vs `schema.ts` `"product"|"prepared"`.~~ ✅ Fixed: `RecipeType = "product" | "prepared"` (type-contract test in `apps/web/tests/shared/recipe-type.test.ts` fails typecheck on drift). (RefundLine `grossAmount` resolved: present `shared/types.ts:578`, selected `refunds.repository.ts:240-259`, pinned by test.)

### M4. Status codes for bad FK in POST body [Low — kept 404 by intent]

Unknown `externalProductId`/`itemId` → 404 (`orders.service.ts:104-110`, `transfers.service.ts:132`, `purchases.service.ts:45`). Conventionally 400/422 for payload refs. Decision: keep 404 for both URL params and body references — one consistent Arabic "غير موجود" for cashiers. Convention documented in `apps/api/src/middleware/error.ts:4-13`.

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

> Resolved: search inputs clear the icon on the inline-start side (`pos/page.tsx` `ps-12`, `refunds/page.tsx` `ps-11`, pinned by test).

> Resolved: cart lines render via the shared decimal-total helper (`cartLineTotal`, `pos/page.tsx:710`).

> Resolved: render + submit read through the `refundDraftEntry` normalizer fed by `chooseOrder`, and the quantity/stock updaters initialize missing entries from it (`refunds/page.tsx:236,254-257,265-270`).

### 4.3 UX / edge gaps

- **[Low] Waste forces cafe for products — ✅ Fixed:** choosing a product from main (or switching warehouse while a product is selected) forces cafe and shows a status notice (`waste-target.ts`, `waste/page.tsx`).
- **[Low] Table captions missing at call sites:** `components/ui/table.tsx:3-19` now sets `scope="col"` + optional sr-only `<caption>`, but no table passes `caption` yet. Fix: add `caption` per table.
- **[Low] Print receipt RTL — resolved:** `.receipt-print-root` anchors with `inset-inline-start` instead of physical left (pinned by test).

Auth correct: cookie-first + Tauri Bearer fallback (`lib/api.ts:22-28`, `lib/auth.ts:26-30,71-87`), 401 clears (`lib/api.ts:34`), `AuthProvider` gates via `canOpenPath` (`auth-provider.tsx:47-78`).

---

## 5. Security

### 🟢 S3 — CORS non-browser bypass; TRUST_PROXY footgun guarded [Low]

- `app.ts:36-42`, `env.ts:8-47`, `docker-compose.yml:68`. `origin:(o,cb)=>cb(null,!o||includes(o))` — curl/no-Origin always passes (normal CORS, not access control). `secure:req.secure` + `trust proxy` gated by `TRUST_PROXY` (default false, compose true). Mis-set without proxy trusts spoofed `X-Forwarded-Proto`. Correct today. Covered `tests/app/app.test.ts:52`.
- ✅ Completed: documented in `docs/docker.md` (CORS ≠ auth + curl/no-Origin + `TRUST_PROXY`/`X-Forwarded-Proto`); pinned by `security-docs.test.ts`.

### 🟢 S4 — SQLi safe; LIKE wildcards escaped [Low]

- External-orders search escapes LIKE wildcards (`external-orders.repository.ts:8-9,52`, pinned by test). Drizzle params throughout; `reports.repository.ts` has no LIKE/text search today (date-range SQL only), so no wildcard handling applies there.

### 🟢 S6 — Env contract gaps [Fixed]

- Root `.env.test` includes `EXTERNAL_ORDERS_*`; `env.test.ts` parses it as a complete config (`env.ts` required keys).
- `.env.example` is the single template for local + production vars (no separate `.env.production.example` by intent); compose requires `.env.production` + `MYSQL_PASSWORD/ROOT/DATABASE_URL/CORS_ORIGIN/NEXT_PUBLIC_API_URL`.

---

## 6. Data integrity / concurrency

- **D2 (=C2)** external refund stock leak — ✅ Fixed: `refunds.service.ts` restocks ingredients on `return_to_stock` and writes waste on `not_returnable`; pinned by `refunds.test.ts`.
- **🟢 D4 Deadlock retry shared [Fixed]:** ~~`categories.service.ts` `transactionWithDeadlockRetry` vs bare `repo.transaction` in orders/refunds/transfers/purchases~~ ✅ Fixed: shared wrapper in `apps/api/src/lib/deadlock-retry.ts` now wraps the whole document transaction in orders, refunds, purchases, transfers (approve/reject/direct), and categories (create/update/deactivate — `create` previously skipped the retry). Each retry re-runs the full transaction against fresh state, so duplicate-key replay handling inside the catch still works. Pinned by unit tests (`tests/lib/deadlock-retry.test.ts`: retry once on `ER_LOCK_DEADLOCK`, no retry on other errors, plus one retry test per service). Still open under §7: true concurrency race tests (double-sale, over-refund, double-approve).
- **🟢 D5 Idempotency on purchases/transfers [Fixed]:** `purchase_invoices` and `transfer_requests` have NOT NULL `client_request_id` + `request_fingerprint` (`schema.ts`, `0035_purchases_transfers_idempotency.sql` nullable add → backfill from row `id` → NOT NULL + unique). Replay and payload-mismatch 409 covered in `purchases.test.ts` / `transfers.test.ts`. `wasteEntries.clientRequestId` remains nullable-unique (by design, fragile).
> Removed: D1 (false positive), D3 (intended negative-stock design), D6/D7 (accepted minors).

---

## 7. Missing tests

Exists: solid unit (schemas, services, rate-limit, env, RBAC 403s) + HTTP/MySQL tests (auth, orders replay+negative flag, refunds discounted-thirds+replay, transfers shift-close race, inventory concurrent consume/receipt, shifts single-slot race, purchases duplicate-invoice race, categories inverse-move deadlock). Web: services/models/architecture/components mapping.

Gaps (highest value first):

1. Concurrent POS double-spend — two simultaneous sales same cafe batch; assert one 409 + deficit accounting. (`inventory.test.ts:108` covers primitive, not order path.)
2. Concurrent refunds over-refund race — two refunds same line racing `refundedQuantities` (`refunds.service.ts:88-118`).
3. Transfer double-approve race — two `approveRequest`; second must 409 (`transfers.service.ts:52-55` `lockRequest` untested).
4. Idempotency mismatch — same `clientRequestId` + different fingerprint/different cashier → 409 (`assertReplay` only happy-path).
5. Discount boundaries — 100% pct, fixed==subtotal (total 0 cash 0), fixed>subtotal → 400, pct>100 → 400. Schema tests partial; no e2e totals.
6. RBAC matrix e2e — cashier blocked `/api/products|/inventory|/purchases|/suppliers|/users` (only spot 403s in users/items/reports/shifts). Products/inventory/purchases/suppliers lack explicit 403 tests. (`/api/expenses` create and `/api/transfers` requests are intentionally cashier-allowed — do not assert 403 there.)
7. Deadlock-retry orders/refunds — no test (only categories).
8. Purchases/transfers double-submit — ✅ covered (`purchases.test.ts` / `transfers.test.ts` replay + mismatch; see D5).
9. Structural: `apps/api/package.json` `pnpm test` runs every `tests/**/*.test.ts` file (mocked and MySQL-backed together). MySQL-backed files import `tests/setup.ts` and need repo-root `.env.test`. No CI / no `.github` by intent.

---

## 8. DevOps / config gaps

- `docker-compose.yml`, `dockerfile.api`, `dockerfile.web`, `turbo.json`, `api/package.json`, `web/package.json`, `tsconfig.base.json`.
- No `.env.production.example` by intent — `.env.example` is the single template for local + production vars (see S6).
- `migrate` no healthcheck/completion visibility beyond `service_completed_successfully`; `cache-worker` no healthcheck (silent catalog-stall risk). `api` healthcheck `/health` unauthenticated — fine, document public.
- `turbo.json`: `test dependsOn ^build` good; `lint`/`typecheck` no `dependsOn` (fine, but web `lint:"eslint"` no path relies on flat-config defaults — verify lints `src`; api lints `src tests` explicitly).
- `NEXT_PUBLIC_API_URL` baked at build (`dockerfile.web:16-17`, `next.config.ts:25-27`) — change needs rebuild.
- Good: `api build` builds shared first — keep.

---

## 9. Forgotten edge cases

| # | Edge | Status / Evidence | Severity |
|---|---|---|---|
| E1 | Returns/refunds | Prorated + over-refund guards good (`refunds.service.ts:99-183`). (a) C2/D2 ✅ Fixed — external `return_to_stock` restocks ingredients, `not_returnable` writes waste (`refunds.service.ts` + `refunds.test.ts`). (b) E1b ✅ Fixed — CHECK requires `stock_action` for item/external and NULL for recipe (`schema.ts`); `0034_relax_refund_action_type_chk.sql` backfills leftover external NULLs to `not_returnable`. No-exchange accepted (skip). | **Fixed** |
| E2 | Discounts | POS pct/fixed validated (`orders.schemas.ts:39-52`, `orders.service.ts:130-141`); catalog windows per line (`external-order-line.ts:166-178`, `shared/external-discount.ts`). ~~Gap: stacked (catalog% then POS%/fixed) computed independently, no test pinning combined total~~ ✅ Pinned by `tests/orders/stacked-discounts.test.ts` (catalog% → modifier extra full-price → POS %/fixed on line subtotals, half-up rounding, totals/change). Modifier extra post-discount verify intent. | **Pinned** |
| E5 | Variants | Retain all three line types per amended spec §7/§10: `external_product` (flat external catalog with sizes/modifiers + sellability guards in `external-order-line.ts:96-126`), plus restored internal `recipe` products and as-is `item` resale POS sales. `OrderLine:recipe\|item\|external_product` (`types.ts:483`) is live. | Low-Med |
| E7 | Low-stock alerts | Flags only `isLowStock/isNegativeStock` (`inventory.service.ts:266-276` + `items.test.ts:235`); `reports.stock()` qty vs minimums. No push/job, no threshold audit. | Low (spec-dep) |

> Removed: E3 (no cafe→main returns — intended), E4 (=D1, false positive), E6 (no expiry/FEFO — intended), E1c (no exchange — skip).

Additional frontend edges (§4.3): waste warehouse override, missing table captions.

---

## 10. Priority fix order

1. ~~Resolve external-product refund stock handling (C2/D2/E1a)~~ ✅ Fixed — restock or auto-waste; CHECK + 0034 backfill (E1b).
2. ~~Add idempotency keys to purchases + transfers (D5) with race tests; fix purchase duplicate catch (C1); canonicalize idempotency fingerprints (M2)~~ ✅ Fixed.
3. ~~Share deadlock-retry beyond categories + add sales/refund/approve concurrency tests (D4, §7.1-3)~~ Wrapper shared + applied (D4 ✅); concurrency race tests remain open (§7.1-3).
4. Build salaries module + stocktake module (§2.8, §2.3); wire salaries into cash-flow + employees report; replace `/salaries` stub.
5. ~~Decide dead `recipe` waste path — remove or implement (§2.10)~~ ✅ Fixed (see §2.10); document single-register constraint or implement per-terminal slots (W1); record POS-hierarchy decision (§2.14-1).
6. Security/config (kept): document CORS ≠ auth (S3); LIKE escaping verified (S4); `.env.test` contract verified (S6).
7. DevOps (kept): add `migrate`/`cache-worker` healthchecks; fix `NEXT_PUBLIC_API_URL` rebuild coupling or document it.
8. Frontend (kept): keep `/salaries` nav advertised while §2.8 is built; missing table captions at call sites. Waste warehouse feedback ✅ Fixed.
9. Edge cases (kept): ~~pin stacked-discount combined math with test (E2)~~ ✅ Pinned by `tests/orders/stacked-discounts.test.ts`; decide low-stock alerting scope (E7).

> Removed from scope: old C1–C4 (false positives / intended), §2.11 refund→waste (implemented), N1–N5, S1/S2/S5, D1/D3/D6/D7, CI/`.github` (no CI by intent), `.env.production.example` (`.env.example` is the template), pool/tsconfig/pnpm/images notes, E3/E4/E6/E1c, `apps/temp-backend/` (gitignored local clutter).

---

## Appendix A. What is solid

- All stock-mutating paths (orders, transfers, purchases, refunds, waste) run document + FIFO writes inside single DB transaction via `repo.transaction(..., inventory)` — `inventory.service.ts:218-220` throw-after-partial safe via rollback.
- Idempotency via `clientRequestId` + `ER_DUP_ENTRY` in orders/refunds/waste/expenses/purchases/transfers (C1/D5).
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

