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
- [ ] `purchase_invoices` + `purchase_lines` (creates FIFO batches in main)
- [ ] Payment on invoice: full / partial / credit → supplier balance
- [ ] Purchases screen + invoice entry form
- [ ] Statement includes purchase invoices (not just payments)

## 5. Cafe Sub-Warehouse & Transfers

- [ ] `transfer_requests` + `transfers` + `transfer_lines`
- [ ] Cashier: create transfer request
- [ ] Admin: approve (editable quantities) / reject; direct transfer
- [ ] Stock moves main → cafe with batch costs
- [ ] Cafe stock view

## 6. Recipes

- [ ] `recipes` + `recipe_sizes` + `recipe_ingredients`
- [ ] Recipe products with size variants (S/M/L, own price + quantities)
- [ ] Sub-recipes (prepared items) + "prepare batch" action (`preparations`)
- [ ] Live FIFO ingredient cost + margin per size

## 7. POS (Sales)

- [ ] `orders` + `order_lines` (price + FIFO cost snapshot)
- [ ] POS screen: category tabs → product grid → cart → cash + change
- [ ] Discounts (percent / fixed, logged per cashier)
- [ ] Stock deduction from cafe (recipes → ingredients, as-is → item)
- [ ] Negative-stock flag (sale never blocked)
- [ ] 80mm Arabic thermal receipt (auto-print + reprint)

## 8. Shifts

- [ ] `shifts` table (one open at a time)
- [ ] Open with counted float
- [ ] Shift screen: running totals (orders, sales, discounts, refunds, expenses)
- [ ] Close with counted drawer → expected vs actual → over/short per cashier
- [ ] Orders/refunds/expenses blocked unless a shift is open
- [ ] Admin: close-left-open / reopen with audit note

## 9. Refunds

- [ ] `refunds` + `refund_lines` (against original order, full or per line)
- [ ] Cash refund reduces current shift expected drawer
- [ ] As-is items: return to stock or mark as waste; recipes stay consumed
- [ ] Reason logging + reports feed

## 10. Waste

- [ ] `waste_entries` (warehouse, item or recipe product, qty, reason, FIFO cost)
- [ ] Cashier: cafe waste only; admin: anywhere
- [ ] Recipe-product waste deducts ingredients

## 11. Expenses

- [ ] `expenses` + `expense_categories` (flat, admin-managed)
- [ ] Shift expenses (cashier, from drawer → reduces expected cash)
- [ ] General expenses (admin, anytime)

## 12. Employees & Attendance

- [ ] `employees` (profile, pay type/rate, PIN)
- [ ] Attendance screen (name + PIN clock in/out) + `attendance_logs`
- [ ] Hours/days computation + admin corrections with audit note

## 13. Salaries

- [ ] Pay types: monthly / daily / hourly (from attendance)
- [ ] `salary_advances` (cash out immediately) + `salary_adjustments` (bonus/deduction)
- [ ] Payday screen: net = pay + bonuses − deductions − advances → `salary_payments`
- [ ] Salary history per employee

## 14. Stocktake (جرد)

- [ ] `stocktakes` + `stocktake_lines` (per warehouse, all or by category)
- [ ] Counted vs recorded diff → adjustment doc (shrinkage/surplus via FIFO)
- [ ] Single-item manual adjustment with note

## 15. Reports & Dashboard

- [ ] Admin dashboard: today sales/profit, open shift, low stock, negative stock, pending transfers
- [ ] Sales & profit (day/product/category/shift/cashier, COGS, discounts, refunds)
- [ ] Stock & movement ledger + stocktake history
- [ ] Money & expenses (cash flow, category breakdown, over/short, supplier balances)
- [ ] Employees & attendance + salary history
- [ ] Waste & refunds report
- [ ] Suppliers report (statements, purchases, balances)
- [ ] PDF export (Arabic) for every report
