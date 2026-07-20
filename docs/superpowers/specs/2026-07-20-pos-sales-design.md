# POS Sales Design

**Date:** 2026-07-20  
**Status:** Approved through the owner-approved system specification and explicit implementation authorization

## Scope

Implement Phase 7 from `docs/tmp-xx.md`: takeaway cash sales for recipe products and as-is resale items, order-level discounts, cafe FIFO deductions with non-blocking negative stock, immutable price/cost snapshots, and Arabic 80mm receipts with automatic print and reprint.

Shifts remain Phase 8. Orders therefore expose a nullable `shiftId` now so the shift foreign key and open-shift enforcement can be added without changing the POS contract.

## Chosen architecture

The POS is a dedicated layered `orders` module. Its repository owns a single database transaction spanning the order header, order lines, FIFO allocation snapshots, and stock ledger writes. It composes the existing transaction-bound inventory primitive rather than opening nested transactions.

This was chosen over placing sales in the inventory module, which would mix financial documents with stock primitives, and over a thin cross-module service, which would make the atomic boundary and immutable snapshots harder to reason about.

## Data model

`orders` stores order number, cashier, nullable future shift, subtotal, discount type/value/amount, total, cash received, change, negative-stock flag, and timestamps.

`order_lines` stores the selected recipe and size or resale item, immutable Arabic product/size names, quantity, unit price, line subtotal, known FIFO cost, and whether the line caused a deficit.

`order_line_allocations` stores each ingredient or as-is item allocation against its source FIFO batch. A null batch represents the exact negative-stock deficit at sale time with zero provisional cost. Later inventory receipts already reconcile deficit movements through `stock_deficit_allocations`.

All monetary calculations use integer piastres and all stock calculations follow the existing three-decimal quantity and six-decimal unit-cost conventions.

## API and data flow

- `GET /api/orders/catalog` returns active recipe products with active sizes and active resale items, grouped through category identifiers suitable for main/subcategory filtering.
- `POST /api/orders` accepts cart selections, discount input, and cash received. The server owns all names, prices, totals, and change calculations.
- `GET /api/orders` returns recent immutable sales for reprint selection.
- `GET /api/orders/:id` returns the receipt/detail projection including line snapshots.

Both authenticated roles can use these endpoints. Creation locks selected products/items deterministically, rejects inactive or malformed selections, combines duplicate selections, writes the order to obtain its reference ID, expands recipe quantities into ingredients, consumes cafe FIFO with negative stock allowed, records line/allocation snapshots, and updates final cost/negative flags before commit.

## Web experience

The `/pos` route is a touch-oriented two-pane Arabic RTL interface: menu discovery and filters on the larger pane, with a persistent cart/payment panel. Main categories are tabs and subcategories form a second filter row. Recipe sizes appear as explicit choices; resale items add directly.

Cart quantities use large increment/decrement controls. The totals panel supports no discount, percentage discount, or fixed discount and displays server-consistent subtotal/discount/total/change. Completing a sale opens the isolated receipt view and invokes browser printing after the saved order is loaded. A recent-orders panel supports exact reprints without recomputing historical values.

Print CSS hides the application shell and formats only the receipt at 80mm with Arabic text, shop name, order number/time/cashier, lines, discount, total, received, and change.

## Error handling

Validation errors identify invalid cart/payment/discount input. Conflicts identify inactive or changed products. Stock shortages never reject a valid sale; uncovered quantities become explicit zero-cost deficit allocations and set the order/line negative-stock flags. Any database or stock operation failure rolls back the whole order.

The UI keeps the cart intact on API failure and shows an Arabic error. It clears the cart only after receiving the saved immutable order.

## Verification

Test-first coverage includes input validation, authoritative money calculations, duplicate-line normalization, recipe ingredient expansion, resale deduction, FIFO snapshots, deficit behavior, transaction rollback, authentication and both roles, catalog/detail/list projections, client models/services, cart math, receipt content, print trigger isolation, and navigation/unfinished-module wiring.

The completion gates are repository tests, API integration tests, lint, typecheck, and production build. The repository-wide Prettier check is tracked separately because it was already red across unrelated files before this feature.
