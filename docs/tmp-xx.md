# Build Plan — Feature Checklist (in build order)

Locked scope per [system-specs.md](system-specs.md). Order goes foundation → dependencies → money screens → reporting.

Reticked 2026-09-24 against the running code. Remaining gaps are tracked in [audit-report.md](audit-report.md).

## 0. Foundations ✅

- [x] Monorepo (pnpm + Turborepo), Next.js web, Express api, shared package
- [x] MySQL databases (dev + test), Drizzle ORM + migrations
- [x] Root `.env` / `.env.example` / `.env.test`
- [x] API layered module pattern (schemas → repository → service → controller → router)
- [x] Error middleware + zod validation + DB-backed vitest setup
- [x] RTL Arabic layout, espresso design tokens, IBM Plex Sans Arabic
- [x] UI kit: Button, Field, Modal (a11y), Table, Badge, PageHeader
- [x] Sidebar navigation (all planned sections + system-user accounts)

## 1. Auth & Users ✅

- [x] `users` table (admin / cashier) + seed admin
- [x] Login page + JWT sessions
- [x] Role middleware on API (admin-only vs cashier routes)
- [x] Route guards in web (redirect to login, hide admin screens)
- [x] User-account management (create/edit/activate/deactivate/reset password)
- [x] Self-service password change
- [x] Expired-session detection + safe return to deep links after login

## 2. Categories (main → sub) ✅

- [x] `categories` table (self-referencing parent)
- [x] CRUD API + admin screen (tree view, add/rename/deactivate)
- [x] Used by items; products follow with recipes

## 3. Items & Main Warehouse ✅

- [x] `items` table (name, category, stock unit, purchase unit + conversion, type raw/resale/prepared, min level per warehouse)
- [x] `stock_batches` + `stock_movements` (FIFO core)
- [x] FIFO consume/insert engine (shared service used by every later feature)
- [x] Items CRUD screen with categories filter
- [x] Current stock view (main warehouse) with FIFO value
- [x] Low-stock alerts (min level per warehouse)

## 4. Suppliers & Purchases

- [x] `suppliers` + `supplier_payments` tables
- [x] Suppliers CRUD (soft delete) + balances
- [x] Payments + account statement screen
- [x] `purchase_invoices` + `purchase_lines` (creates FIFO batches in main)
- [x] Payment on invoice: full / partial / credit → supplier balance
- [x] Purchases screen + immutable invoice entry/detail flow
- [x] Statement includes purchase invoices and server-calculated running balances

## 5. Cafe Sub-Warehouse & Transfers ✅

- [x] `transfer_requests` + request lines + immutable `transfers` + FIFO allocation lines
- [x] Cashier/admin: create transfer request and view shared request history
- [x] Admin: approve with edited quantities / reject with reason; direct transfer
- [x] Atomic main → cafe stock move with original FIFO batch costs
- [x] Cafe stock, request review, transfer history, and transfer detail screens

## 6. Recipes ⚠️ Partial

- [x] `recipes` + `recipe_sizes` + `recipe_ingredients`
- [ ] Sellable recipe products with size selling prices (create is `prepared` only; the recipes “products” tab is the external catalog)
- [x] Sub-recipes (prepared items) + "prepare batch" action (`preparations`)
- [ ] Live cost-% / margin next to selling price (`RecipeMargin` unused). Prepared recipes show FIFO unit cost
- [x] Atomic cafe FIFO consumption, costed prepared-output batches, and immutable preparation allocation history
- [x] Admin recipe/preparation screens with lifecycle controls and shortage visibility

## 7. POS (Sales) ⚠️ Partial

- [x] `orders` + `order_lines` (price + FIFO cost snapshot)
- [ ] Internal main/sub tabs plus a flat external group. Current POS is a flat external-catalog chip list → product grid → cart → cash + change
- [x] Discounts (percent / fixed, logged per cashier)
- [x] Catalog size buttons, tiles, and cart show the same discounted catalog price
- [ ] Cafe stock deduction for `recipe` / `item` lines. Current sales are `external_product` only and deduct mapped external ingredients
- [x] Negative-stock flag (sale never blocked)
- [x] 80mm Arabic thermal receipt (auto-print + reprint)

## 8. Shifts

- [x] `shifts` table (one open at a time)
- [x] Each shift records the authenticated cashier user and linked employee
- [x] Cashier-only open with counted float; admin cannot open
- [x] Shift screen: worked duration and running order, sales, discount, and transfer-request totals
- [x] Shift screen running totals include refunds, expenses, and waste entries
- [x] Close with counted drawer → expected vs actual → over/short per cashier
- [x] Orders blocked unless the authenticated cashier owns the open shift
- [x] Cashier transfer requests blocked without the cashier's open shift and linked to it
- [x] Refunds blocked unless the authenticated cashier owns an open shift
- [x] Expenses blocked unless a shift is open
- [x] Admin: force-close / reopen / correct with audit note

## 9. Refunds ✅

- [x] `refunds` + `refund_lines` (against original order, full or per line)
- [x] Cash refund reduces current shift expected drawer
- [x] External / as-is lines: return to stock or mark as waste; recipe lines (if present) stay consumed. Live sales currently produce `external_product` only
- [x] Reason logging + immutable refund history ready for the reports feed

## 10. Waste ⚠️ Partial

- [x] Refund-linked cafe `waste_entries` foundation (item, qty, reason, exact source-allocation FIFO cost)
- [x] General `waste_entries` support (warehouse, item or recipe product, qty, reason, FIFO cost)
- [x] Cashier: cafe waste only with an owned open shift; admin: anywhere
- [ ] Waste of a sellable recipe product (catalog currently lists prepared recipes and deducts their formula)

## 11. Expenses ✅

- [x] `expenses` + `expense_categories` (flat, admin-managed)
- [x] Shift expenses (cashier, from drawer → reduces expected cash)
- [x] General expenses (admin, anytime)

## 12. Employees & Cashier Work Time

- [x] `employees` (profile, monthly pay type/rate on create, notes, active flag; no PIN). Daily/hourly remain in spec/DB; payday is monthly-only
- [x] Employees have no login access by default; admin can grant/revoke cashier access
- [x] One-to-one employee ↔ user link (required for cashier users) with preserved employee history
- [x] Existing cashier users are migrated to linked employee records
- [x] Cashier actions remain audited by user and reportable through the linked employee
- [x] Cashier shift open/close provides worked-time tracking
- [x] Non-cashier employees have no login, PIN, attendance, or worked-hours tracking

## 13. Salaries ⚠️ Partial

- [x] Monthly salary calculations and payday (`net = monthly pay + bonuses − deductions − advances` → `salary_payments`; integer cents; cannot pay a month on or before the latest paid month)

- [ ] Daily / hourly computed pay (schema enum still has those types; payday 409s unless monthly)
- [x] `salary_advances` (cash out immediately) + `salary_adjustments` (bonus/deduction)
- [x] Salary history per employee (reports employee history + payday screen)

## 14. Stocktake (جرد) ✅

- [x] `stocktakes` + `stocktake_lines` (per warehouse, all or by category)
- [x] Counted vs recorded diff → adjustment doc (shrinkage/surplus via FIFO)
- [x] Blank counted-quantity boxes are missing, not zero; save/confirm blocked until every line has a number (typed 0 is a real count)
- [x] Single-item manual adjustment with note

## 15. Reports & Dashboard ⚠️ Partial

- [x] Admin dashboard: today sales/profit, open shift, low stock, negative stock, pending transfers
- [x] Sales & profit (day/product/shift/cashier, COGS, discounts, refunds)
- [ ] Sales by category for live external POS sales (query still inner-joins local recipe/item categories)
- [x] Stock & movement ledger including stocktake history
- [x] Money & expenses (cash flow including salary payments and advances, category breakdown, over/short, supplier balances)
- [x] Employees, cashier worked-time, cashier actions, and salary history
- [x] Waste & refunds report
- [x] Suppliers report (purchases and balances; existing supplier statements remain linked from suppliers)
- [ ] Dedicated PDF export. Current print is browser `window.print()` (Arabic page, English codes remain on several row types)

## Deferred technical decisions

- [ ] Decide whether items with non-zero stock may be deactivated. The current intentional behavior keeps their stock visible and supports later reactivation.
- [ ] Consolidate duplicated decimal, optional-text, and response-type utilities when their contracts stabilize; this is cleanup rather than a current behavior bug.
