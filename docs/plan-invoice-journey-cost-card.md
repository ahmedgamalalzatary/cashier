# TEMP PLAN — Invoice journey ("capital cycle") + Cost card

Status: draft for owner review. Delete this file once both features ship.
Scope: desktop app only (`apps/api` + `apps/web`). The online site has no
purchases/recipes pages, so nothing changes there. No new tables, no
migrations, no sync changes — both features only read existing data.

---

## Agreed decisions

### A. Invoice journey ("capital cycle")
- Opened from a **"رحلة الفاتورة"** button on each purchase invoice page.
- Answers: where did this invoice's goods go, how much was sold, for how much,
  and how much profit was made.
- Follows every unit of the invoice through: main stock → transfer to cafe →
  sale / used in a prepared item (followed further) / waste / stocktake
  shortage / refund back to stock → still in stock.
- **Sale price split by cost share.** Example: latte sold for 20, milk cost 14,
  coffee cost 3 → milk's sale share = 20 × 14/17 = 16.47, profit 2.47.
- Sale price = what the customer actually paid (after order discount, including
  add-ons) = `line_subtotal × order.total / order.subtotal` (same rule the
  reports already use).
- Refunds reduce the sales figure. Refunded-to-stock quantity returns to "still
  in stock" (and is followed again); not-returnable refunds show as wasted.
- Sales made before stock existed (negative stock) count once they were matched
  to a later batch; still-unmatched ones show as "not yet matched".

### B. Cost card
- For **prepared items (recipes made of ingredients) only**. Nothing sold
  directly (menu products, add-ons, resale items) gets a card.
- Shows: each ingredient with quantity and cost, total cost, unit cost.
- Ingredient cost = current cafe stock cost (FIFO). If the cafe doesn't have
  enough, the rest is costed from the main warehouse and marked "من الرئيسي".
  "—" only when cafe + main together don't have enough.
- The "enough stock to prepare" warning keeps using cafe stock only (unchanged).
- Opened by a **"بطاقة التكلفة"** button on each prepared item card (Recipes page).
- Printable on A4 (reuses the existing `report-print-root` A4 print style).

---

## How the data links (verified in code)

```
purchase_invoices
  └─ stock_batches (source_type='purchase', source_id=invoice.id, warehouse=main)
       ├─ stock_movements (batch_id, qty<0, movement_type=…)
       │    transfer_out        → transfer_lines.source_batch_id → cafe_batch_id   (child batch)
       │    preparation_out     → preparation_allocations.source_batch_id
       │                           → preparations.output_batch_id                  (child batch, by cost share)
       │    sale                → order_line_allocations.batch_id → order_lines/orders (revenue)
       │    waste               → waste_allocations.batch_id
       │    stocktake_shortage  → cost lost
       ├─ stock_deficit_allocations.batch_id  (sale / shortage made before stock arrived,
       │                                       settled later by this batch)
       │    → deficit movement → order_line_allocations.stock_movement_id
       ├─ refund_line_allocations.order_line_allocation_id → returned_batch_id (child batch)
       └─ remaining_quantity × unit_cost  = still in stock
```

Sources: `packages/db/src/schema.ts`, `apps/api/src/modules/inventory/inventory.service.ts`
(receive / consume / deficits), `orders.service.ts:245` (sale allocations),
`refunds.service.ts:349,400` (refund_return batches), `recipes.service.ts:202-243`
(preparation allocations), `purchases.service.ts` (`movementType 'purchase'`,
`referenceId invoiceId`).

---

## Phase 0 — Baseline (before touching code)

Confirm green in the touched areas only:
- `@cashier/api`: lint, typecheck, tests for `purchases`, `recipes`, `inventory`.
- `@cashier/web`: lint, typecheck, tests for `recipes-feature`, `print-feature`, purchases.
- `@cashier/shared`: typecheck/build.
- `packages/db` MySQL tests: `purchases.test.ts`, `recipes.test.ts`.

---

## Phase 1 — Cost card (smaller, ship first) — DONE

Also fixed: recipe ingredients now return `itemCode` (the page already
labelled them with it but the API dropped it).

### 1.1 API — main-warehouse fallback in recipe costing (TDD)
- `apps/api/src/modules/recipes/recipes.repository.ts`
  - Add `availableMainBatches(itemId)` (or generalize `availableCafeBatches` →
    `availableBatches(itemId, warehouse)`), same FIFO order.
- `apps/api/src/modules/recipes/recipes.service.ts` → `costIngredients()`
  - Cost from cafe batches first; any shortfall from main batches (FIFO).
  - Per ingredient return `costSource: "cafe" | "main" | "mixed" | null`.
  - `currentCost` null only if cafe + main are short. Recipe `currentCost` /
    `estimatedUnitCost` null only if any ingredient is null.
  - `hasSufficientStock` stays cafe-only (prepare button logic unchanged).
- Tests: `apps/api/tests/recipes/recipes.service.test.ts`
  - cafe enough → source cafe; cafe empty → main; partial → mixed (exact cost);
    both short → null; `hasSufficientStock` still false when cafe short.
- DB test (if repository query changes): `packages/db/tests/mysql/recipes.test.ts`.

### 1.2 Shared type
- `packages/shared/src/types.ts` → `RecipeIngredientCost` add
  `costSource: "cafe" | "main" | "mixed" | null`.
- Update fixtures that build `RecipeIngredientCost` (web tests / api tests).

### 1.3 Web — cost card modal + print
- New `apps/web/src/components/recipes/cost-card-modal.tsx`
  - Header: recipe name, output item, base yield + unit, date/time generated.
  - Table: ingredient, quantity + unit, cost, source badge ("من الرئيسي" / "مختلط").
  - Footer: total cost, unit cost; "—" with a short note when not costable.
  - "طباعة" button; printable block uses `report-print-root` (A4).
- `apps/web/src/app/recipes/page.tsx` → `PreparedCard`: add "بطاقة التكلفة" button
  + modal state.
- Tests: `apps/web/tests/architecture/recipes-feature.test.ts`,
  `apps/web/tests/architecture/print-feature.test.ts` (follow existing patterns).

### 1.4 Docs
- `docs/system-specs.md` §10 line 309 "Live costing": replace "cost %, margin /
  selling price" promise with the cost card rule above (prepared items only,
  cafe → main fallback, A4 print).

### 1.5 Green check
- Targeted lint / typecheck / tests for api recipes, shared, web recipes/print.

---

## Phase 2 — Invoice journey: API — DONE

Built as `invoice-journey.ts` (pure exact-fraction walker),
`invoice-journey.repository.ts`, `invoice-journey.service.ts`;
route `GET /api/purchases/:id/journey`. Refunds reverse a sale
proportionally (refunded qty / allocation qty).

### 2.1 Repository (read-only queries)
- `apps/api/src/modules/purchases/purchases.repository.ts` (or a new
  `purchases/invoice-journey.repository.ts` if it grows large):
  - `invoiceBatches(invoiceId)` — main batches with `source_type='purchase'`.
  - `batchOutflows(batchIds)` — `stock_movements` with `quantity < 0` grouped
    by batch + type + reference.
  - `settledDeficits(batchIds)` — `stock_deficit_allocations` + deficit movement
    type/reference.
  - `transferChildren(batchIds)` — `transfer_lines` source → cafe batch.
  - `preparationChildren(batchIds)` — allocations + `preparations` output batch,
    total exact cost, produced qty.
  - `saleAllocations(batchIds / movementIds)` — `order_line_allocations` + line
    subtotal + order total/subtotal + all allocations of that line (for the
    cost-share denominator, incl. settled deficit cost).
  - `refundAllocations(orderLineAllocationIds)` — refund qty, refund amount
    share, `stock_action`, `returned_batch_id`.
  - `batchRemaining(batchIds)` — remaining qty × unit cost.
  - All queries use `branchCondition` / `branchTable` like the rest of the module.

### 2.2 Service — `getJourney(invoiceId)`
- Walk batches breadth-first starting from the invoice's main batches, carrying
  a **fraction** (exact bigint, scale 9 like the existing code) of each child
  batch that belongs to this invoice:
  - transfer child: same fraction as the source portion.
  - preparation child: fraction = (this invoice's ingredient cost in that
    preparation) / (preparation exact total cost).
  - refund-return child: fraction of the refunded allocation.
- Buckets per invoice line (item) and in total, each with quantity (in the
  invoice item's stock unit where meaningful) and cost:
  `sold` (cost, sales share, profit), `refunded`, `in prepared items`
  (followed), `wasted`, `stocktake shortage`, `still in stock (main / cafe)`,
  `not yet matched` (unsettled deficit — shown as info).
- Sales share per sale allocation =
  `line net revenue × allocation cost / line total cost`, where line cost uses
  settled deficit cost. If a line's total cost is 0, split by quantity share
  (edge case; noted in UI).
- Invariant tested: Σ buckets cost = invoice stock cost (± rounding cents).
- Not found → 404 `الفاتورة غير موجودة`.

### 2.3 Controller / router
- `purchases.controller.ts` → `journey` handler.
- `purchases.router.ts` → `GET /:id/journey` (admin-only already via `app.ts:116`).

### 2.4 Shared type
- `packages/shared/src/types.ts` → `PurchaseInvoiceJourney`
  (`totals`, `lines[]` with buckets, optional `preparedItems[]` breakdown,
  `unmatchedSales` note).

### 2.5 Tests (TDD, write first)
- `apps/api/tests/purchases/purchases.service.test.ts` — pure walk logic with a
  fake repo: simple sale; transfer then sale; preparation then sale of the
  prepared item; latte cost-share example (20 × 14/17 = 16.47); order discount;
  refund return-to-stock (followed again) and not-returnable; waste; stocktake
  shortage; deficit sale settled by this invoice; still in stock; Σ invariant.
- `apps/api/tests/purchases/purchases.router.test.ts` — route + 404.
- `packages/db/tests/mysql/purchases.test.ts` — real MySQL end-to-end:
  purchase → transfer → sale → refund → journey totals.

---

## Phase 3 — Invoice journey: Web

- `apps/web/src/services/purchases-service.ts` → `getPurchaseJourney(id)`.
- New page `apps/web/src/app/purchases/journey/page.tsx` (`?id=`, same
  Suspense + query-param pattern as `purchases/detail/page.tsx`):
  - Summary strip: bought cost, sold (sales), profit, still in stock, wasted.
  - Flow diagram-style breakdown (bought → cafe → sold / prepared / wasted / stock).
  - Per-line table: item, bought qty, sold qty, sales, cost, profit, wasted,
    still in stock.
  - Note row for "not yet matched" sales when present.
- `apps/web/src/app/purchases/detail/page.tsx` → "رحلة الفاتورة" link in header actions.
- Tests: add/extend a web architecture test for the purchases journey page
  (follow `apps/web/tests/architecture/*-feature.test.ts` style).

### Docs
- `docs/system-specs.md` §5 Purchasing: add "Invoice journey" rules (cost-share
  sales split, refunds, deficits, read-only).

---

## Phase 4 — Final green (run last, after Phase 5)

All work touches api + shared + web → run full `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build` sequentially.

---

## Likely touched files (summary)

| Area | File |
|---|---|
| Shared types | `packages/shared/src/types.ts` |
| Recipes API | `apps/api/src/modules/recipes/recipes.repository.ts`, `recipes.service.ts` |
| Purchases API | `apps/api/src/modules/purchases/purchases.repository.ts` (+ maybe new `invoice-journey.repository.ts`), `purchases.service.ts`, `purchases.controller.ts`, `purchases.router.ts` |
| Web recipes | `apps/web/src/app/recipes/page.tsx`, new `apps/web/src/components/recipes/cost-card-modal.tsx` |
| Web purchases | `apps/web/src/app/purchases/detail/page.tsx`, new `apps/web/src/app/purchases/journey/page.tsx`, `apps/web/src/services/purchases-service.ts` |
| API tests | `apps/api/tests/recipes/*`, `apps/api/tests/purchases/*` |
| DB tests | `packages/db/tests/mysql/recipes.test.ts`, `purchases.test.ts` |
| Web tests | `apps/web/tests/architecture/recipes-feature.test.ts`, `print-feature.test.ts`, new purchases journey test |
| Inventory API (bug 1) | `apps/api/src/modules/inventory/inventory.repository.ts`, `inventory.service.ts` |
| Refunds API (bug 2) | `apps/api/src/modules/refunds/refunds.repository.ts`, `refunds.service.ts` |
| Bug tests | `apps/api/tests/inventory/*`, `apps/api/tests/refunds/*`, `packages/db/tests/mysql/orders.test.ts`, `refunds.test.ts`, `reports.test.ts` |
| Docs | `docs/system-specs.md` (§5, §10, FIFO, refunds) |

---

## Phase 5 — Bug fixes: cost of sales made before stock arrived

Both bugs come from "deficit" sales: the POS sells with `allowNegative: true`
(`orders.service.ts:254`), so the missing part is recorded at cost `0`. When
stock later arrives, `InventoryTransaction.receive()` matches it
(`stock_deficit_allocations`, `inventory.service.ts:114-167`) — but nobody uses
that matched cost (`deficitAllocations` returned by `receive()` has no caller).

### Bug 1 — Profit report overstates profit on deficit sales
- `orders.total_cost` / `order_lines.total_cost` stay at the `0`-cost value
  forever; every profit figure reads only those columns
  (`packages/server-core/src/modules/reports/reports.repository.ts:51,100,116,129`).
- Fix: when `receive()` settles a deficit movement whose
  `reference_type = 'order'`, recompute that order line's `total_cost`
  (exact sum of its allocations, using the settled cost for deficit parts) and
  the order's `total_cost` (sum of lines), in the same transaction.
  `has_stock_deficit` / `is_negative_stock` stay as history flags.
  - Where: `apps/api/src/modules/inventory/inventory.repository.ts`
    (+ port type), `inventory.service.ts` (`receive`). Every receive caller
    (purchase, transfer_in, preparation_in, refund_return, stocktake_surplus)
    gets the fix for free.
  - Sync: `orders` / `order_lines` already have UPDATE sync triggers
    (`apps/desktop/src-tauri/runtime/migrations/0007_sync_triggers.sql`), so the
    corrected cost reaches the online backup.

### Bug 2 — Refunds of deficit sales return stock at cost 0
- `refunds.service.ts:316-428` and `refunds.repository.ts:179` use
  `order_line_allocations.unit_cost`, which is `0` for the deficit part even
  after it was matched. Result: `refunds.total_cost_returned` is too low (profit
  wrong again) and "return to stock" creates a cafe batch at cost `0` (stock
  value too low, and the next sale of that batch shows too much profit).
- Fix: when planning refund allocations, use the settled cost for a deficit
  allocation (`stock_deficit_allocations` of its `stock_movement_id`; split by
  the settled parts). A still-unsettled part keeps cost `0` (nothing known yet).
  - Where: `apps/api/src/modules/refunds/refunds.repository.ts`
    (allocation query), `refunds.service.ts` (planning uses per-part costs).

### Old data
- None. Owner confirmed all current data is disposable (not launched), so no
  data-fix migration.

### Tests (write first)
- `apps/api/tests/inventory/*` — receive settles an order deficit → line/order
  cost updated; non-order deficit (stocktake) → no order touched; partial
  settlement across two receives.
- `apps/api/tests/refunds/refunds.service.test.ts` — refund of a settled deficit
  sale uses settled cost for returned cost and restock batch cost.
- `packages/db/tests/mysql/orders.test.ts`, `refunds.test.ts`, `reports.test.ts`
  — sale with no stock → purchase → transfer → report profit uses real cost;
  refund after that returns real cost.

### Docs
- `docs/system-specs.md` §FIFO / §Refunds: state that matched deficit cost
  updates the sale cost and is used by refunds.

> Note: Phase 5 can run before Phase 2 if preferred — the invoice journey
> reads matched costs directly, so it is correct either way, but its profit
> only matches the Reports page after Phase 5.

---

## Other notes

- Spec `docs/system-specs.md:309` promises cost % / margin next to selling
  price — never built; rewritten in Phase 1.4.
- Cost card scope confirmed by owner: **prepared items only**.
