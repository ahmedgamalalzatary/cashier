# Build Plan — Feature Checklist (in build order)

Locked scope per [system-specs.md](system-specs.md). Order goes foundation → dependencies → money screens → reporting.

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

## 6. Recipes ✅

- [x] `recipes` + `recipe_sizes` + `recipe_ingredients`
- [x] Recipe products with size variants (S/M/L, own price + quantities)
- [x] Sub-recipes (prepared items) + "prepare batch" action (`preparations`)
- [x] Live FIFO ingredient cost + margin per size
- [x] Atomic cafe FIFO consumption, costed prepared-output batches, and immutable preparation allocation history
- [x] Admin recipe/preparation screens with lifecycle controls and shortage visibility

## 7. POS (Sales)

- [x] `orders` + `order_lines` (price + FIFO cost snapshot)
- [x] POS screen: category tabs → product grid → cart → cash + change
- [x] Discounts (percent / fixed, logged per cashier)
- [x] Stock deduction from cafe (recipes → ingredients, as-is → item)
- [x] Negative-stock flag (sale never blocked)
- [x] 80mm Arabic thermal receipt (auto-print + reprint)

## 8. Shifts

- [x] `shifts` table (one open at a time)
- [x] Each shift records the authenticated cashier user and linked employee
- [x] Cashier-only open with counted float; admin cannot open
- [x] Shift screen: worked duration and running order, sales, discount, and transfer-request totals
- [x] Refund, expense, and waste total fields are ready for their later modules
- [x] Close with counted drawer → expected vs actual → over/short per cashier
- [x] Orders blocked unless the authenticated cashier owns the open shift
- [x] Cashier transfer requests blocked without the cashier's open shift and linked to it
- [x] Refunds blocked unless the authenticated cashier owns an open shift
- [x] Expenses blocked unless a shift is open
- [x] Admin: force-close / reopen / correct with audit note

## 9. Refunds ✅

- [x] `refunds` + `refund_lines` (against original order, full or per line)
- [x] Cash refund reduces current shift expected drawer
- [x] As-is items: return to stock or mark as waste; recipes stay consumed
- [x] Reason logging + immutable refund history ready for the reports feed

## 10. Waste ✅

- [x] Refund-linked cafe `waste_entries` foundation (item, qty, reason, exact source-allocation FIFO cost)
- [x] General `waste_entries` support (warehouse, item or recipe product, qty, reason, FIFO cost)
- [x] Cashier: cafe waste only with an owned open shift; admin: anywhere
- [x] Recipe-product waste deducts ingredients atomically

## 11. Expenses ✅

- [x] `expenses` + `expense_categories` (flat, admin-managed)
- [x] Shift expenses (cashier, from drawer → reduces expected cash)
- [x] General expenses (admin, anytime)

## 12. Employees & Cashier Work Time

- [x] `employees` (profile, pay type/rate, notes, active flag; no PIN)
- [x] Employees have no login access by default; admin can grant/revoke cashier access
- [x] One-to-one employee ↔ user link (required for cashier users) with preserved employee history
- [x] Existing cashier users are migrated to linked employee records
- [x] Cashier actions remain audited by user and reportable through the linked employee
- [x] Cashier shift open/close provides worked-time tracking
- [x] Non-cashier employees have no login, PIN, attendance, or worked-hours tracking

## 13. Salaries

- [ ] Salary calculations for monthly / daily / hourly pay types (automatic worked hours only for cashiers from shifts)
- [ ] `salary_advances` (cash out immediately) + `salary_adjustments` (bonus/deduction)
- [ ] Payday screen: net = pay + bonuses − deductions − advances → `salary_payments`
- [ ] Salary history per employee

## 14. Stocktake (جرد)

- [ ] `stocktakes` + `stocktake_lines` (per warehouse, all or by category)
- [ ] Counted vs recorded diff → adjustment doc (shrinkage/surplus via FIFO)
- [ ] Single-item manual adjustment with note

## 15. Reports & Dashboard

- [x] Admin dashboard: today sales/profit, open shift, low stock, negative stock, pending transfers
- [x] Sales & profit (day/product/category/shift/cashier, COGS, discounts, refunds)
- [x] Stock & movement ledger (stocktake history deferred with the stocktake module)
- [x] Money & expenses (cash flow, category breakdown, over/short, supplier balances; payroll deferred)
- [x] Employees, cashier worked-time, and cashier actions (salary history deferred with salaries)
- [x] Waste & refunds report
- [x] Suppliers report (purchases and balances; existing supplier statements remain linked from suppliers)
- [x] Arabic print / PDF export for every currently available report

## Deferred technical decisions

- [ ] Decide whether items with non-zero stock may be deactivated. The current intentional behavior keeps their stock visible and supports later reactivation.
- [ ] Consolidate duplicated decimal, optional-text, and response-type utilities when their contracts stabilize; this is cleanup rather than a current behavior bug.
