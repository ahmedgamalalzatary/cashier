# Cashier + Warehouse System — Specification

**Date:** 2026-07-19
**Status:** Approved by owner
**Scope:** Single branch — one main warehouse + one cafe (sub-warehouse)

---

## 1. Overview

A cloud-hosted web application combining a cafe POS (cashier) with warehouse/inventory management. Goods are purchased from suppliers into the **main warehouse**, transferred on request to the **cafe**, and sold there either as **recipe products** (deducting ingredients) or **as-is items**. The system also manages shifts, employees, attendance, salaries, expenses, waste, refunds, and full reporting.

| Decision | Locked choice |
|---|---|
| Deployment | Cloud web app (internet required at shop) |
| Roles | Admin + Cashier |
| Language | Arabic only, RTL layout |
| Currency | EGP |
| Branches | One branch (main warehouse + one cafe) |
| Costing | FIFO with purchase batches |
| Stack | Next.js frontend + Express.js backend + MySQL (Drizzle ORM) |

---

## 2. Architecture & Tech Stack

- **Frontend:** Next.js (React, TypeScript), fully RTL Arabic UI. POS screen optimized for fast touch/mouse use.
- **Backend:** Express.js REST API (TypeScript), JWT-based auth with role checks on every endpoint.
- **Database:** MySQL (InnoDB, utf8mb4) accessed via Drizzle ORM (drizzle-kit migrations). All money stored as `DECIMAL`, all quantities as `DECIMAL` (fractional units supported).
- **Printing:** 80mm thermal receipts rendered as an Arabic print view; browser print to the printer attached to the cashier PC. Auto-print after each sale.
- **PDF export:** server- or client-rendered Arabic-friendly PDF for every report.

### Roles & permissions

| Capability | Admin | Cashier |
|---|---|---|
| POS sales, discounts, refunds | ✔ | ✔ |
| Open/close shift, shift expenses | ✔ | ✔ (own shift) |
| Transfer requests (cafe → ask main) | ✔ | ✔ (create request) |
| Approve transfers / direct transfers | ✔ | ✘ |
| Cafe waste entry | ✔ | ✔ |
| Main-warehouse waste, stocktake | ✔ | ✘ |
| Items, categories, recipes, prices | ✔ | ✘ |
| Application users and roles | ✔ | ✘ |
| Purchases, suppliers, payments | ✔ | ✘ |
| Employees, salaries, advances | ✔ | ✘ |
| General expenses, expense categories | ✔ | ✘ |
| Reports & dashboard | ✔ | ✘ |
| Attendance screen (PIN clock-in/out) | shared screen — any employee with their personal PIN | |

---

## 3. Categories (Main → Sub)

- Two-level category tree used by **both** warehouse items and sale products.
- **Main category** (e.g. مشروبات ساخنة) contains **sub-categories** (e.g. قهوة، شاي).
- An item/product attaches to a sub-category, or directly to a main category that has no subs.
- POS: main categories as tabs, sub-categories as a filter row.
- Reports can group by main or sub level.
- Admin manages the tree (add/rename/deactivate).

---

## 4. Items & Stock (Main Warehouse)

### Items
- Fields: name (Arabic), category (main/sub), **stock unit** (kg, g, L, ml, piece, box, …), optional **purchase unit** with conversion factor (e.g. box = 12 pieces; bag = 25 kg), minimum stock level per warehouse, active flag.
- Item types: **raw/resale item** (bought from suppliers) and **prepared item** (produced by a sub-recipe — see §10).

### FIFO batch costing
- Every stock inflow creates a **batch**: quantity + unit cost + date + source (purchase, transfer-in, preparation, refund return, stocktake surplus).
- Every outflow (sale, transfer-out, waste, stocktake shortage) consumes from the **oldest batch first**; the consumed cost is recorded on the movement.
- Transfers move quantities **with their batch costs** from main warehouse batches into cafe batches.
- Stock value at any time = Σ(remaining batch qty × batch cost) per warehouse.

### Alerts
- Low-stock alert per item per warehouse when quantity ≤ minimum level. Shown on dashboard and items list. No expiry-date tracking.

### Stocktake (جرد)
- Admin starts a stocktake session for a warehouse (all items or a selected category).
- Enters actual counted quantities; system shows difference vs. recorded stock.
- Confirming saves an **adjustment document** (with reason note): shortages consume FIFO batches and are reported as **shrinkage**; surpluses create a batch at current FIFO cost and are reported as **surplus**.
- Admin can also make a single-item manual adjustment with a note (same mechanics).

---

## 5. Suppliers & Purchases

### Suppliers
- Fields: name, phone, address/notes, opening balance, active flag.
- **Account statement** per supplier: invoices, payments, running balance.

### Purchase invoices (into main warehouse only)
- Header: supplier, date, invoice number (supplier's paper ref), notes.
- Lines: item, quantity (in purchase or stock unit), unit price → each line creates a FIFO batch.
- **Payment on invoice:** paid in full, partial, or fully on credit (آجل). Unpaid remainder increases the supplier's balance.
- Confirmed purchase invoices are immutable so their FIFO batches and supplier accounting cannot drift; corrections use explicit stock/accounting adjustments rather than editing history.
- **Supplier payments:** recorded any time against the supplier balance (amount, date, note); shown in the statement.
- **No purchase returns** — damaged/rejected goods are recorded as waste (§11).

---

## 6. Cafe Sub-Warehouse & Transfers

- The cafe holds its own stock (with its own FIFO batches carried over from main).
- **Request → approve flow:**
  1. Cashier creates a **transfer request**: items + quantities + note.
  2. Admin reviews, may edit each requested quantity (without adding or dropping item lines), then **approves** → stock moves main → cafe immediately; or **rejects** with a reason.
- All cashiers and admins see the shared request queue for the single cafe. Request lines preserve the originally requested quantities; approved quantities are stored on the resulting transfer.
- Approval is atomic. If any approved quantity is unavailable in the main warehouse, no stock moves, the API returns a conflict, and the request remains pending for adjustment and retry.
- Admin can also create a **direct transfer** (no request) in one step.
- Reviewed requests and completed transfers are immutable audit records. Every transfer document lists items, quantities, source and cafe batch IDs, carried FIFO costs, requester, approver, and timestamps.

---

## 7. POS (Sales)

- **Order type:** takeaway only.
- Flow: product grid (main-category tabs → sub-category filter) → cart with quantities/sizes → cash received → change computed → order saved → receipt auto-prints.
- **Products:** recipe products (with size variants) and as-is resale items. Selling deducts from **cafe stock** only:
  - Recipe product → deducts each ingredient quantity (FIFO) for the chosen size.
  - As-is item → deducts the item itself (FIFO).
- Sales are allowed even if computed stock would go negative (the shop can't stop selling because of a data entry gap); negative stock is flagged on the dashboard for correction.
- **Payments:** cash only. Received amount + change recorded.
- **Discounts:** percentage or fixed amount per order; cashier applies freely; every discount is stored with order, cashier, and shift, and is visible in reports.
- **Receipt:** 80mm Arabic thermal receipt — shop name, date/time, order number, cashier, lines (product/size/qty/price), discount, total, received, change. Auto-print, with a reprint option.
- Every order records: cashier, shift, timestamp, lines with unit price and FIFO cost at sale time (for profit reports).

---

## 8. Shifts

- **One open shift at a time** (single drawer). Orders, refunds, and shift expenses can only be recorded while a shift is open, and attach to it.
- **Open:** cashier logs in and enters the counted **starting float**.
- **During:** shift screen shows running totals (orders count, sales, discounts, refunds, expenses).
- **Close:** cashier counts the drawer and enters **actual cash**. System computes:
  - `expected = float + cash sales − cash refunds − shift expenses`
  - `over/short = actual − expected`
- Over/short is stored against the shift and cashier, with full history in reports.
- Admin can view and close a shift left open, and can reopen/correct a closed shift with an audit note.

---

## 9. Employees, Attendance & Salaries

### Employee records
- Fields: name, phone, job title, hire date, pay type + rate, personal attendance **PIN**, notes, active flag.

### Attendance (check-in/out)
- A dedicated attendance screen on the cafe device: employee taps their name, enters their PIN → clock in or out.
- System computes daily hours and days present; admin can correct entries with an audit note.

### Salaries
- **Pay types (per employee):**
  - Monthly: fixed amount per month.
  - Daily: rate × days present (from attendance).
  - Hourly: rate × hours worked (from check-in/out).
- **Advances (سلف):** recorded any time; cash out immediately (appears in cash-flow); accumulates against the employee until payday.
- **Bonuses / deductions:** dated entries with amounts and notes.
- **Payday screen:** for a chosen period per employee —
  `net = computed pay + bonuses − deductions − advances` → confirm to record the salary payment. Full salary history retained.

---

## 10. Recipes

- A **recipe product** defines the menu item sold at the POS:
  - **Size variants** (e.g. S/M/L): each size has its own ingredient quantities and its own selling price. Single-size products are just one variant.
  - **Ingredients:** cafe-stock items (raw, resale, or prepared) with quantities in stock units.
- **Sub-recipes (prepared items):** a recipe that produces a stock item instead of a menu product (e.g. 1L sugar syrup from sugar + water). Admin runs **“prepare batch”** with a produced quantity → raw ingredients are deducted (FIFO) from cafe stock and a new batch of the prepared item is added at the computed ingredient cost. Prepared items are then used as ingredients in menu recipes.
- **Live costing:** each recipe/size shows its current FIFO ingredient cost next to its selling price (cost %, margin) to guide pricing.
- Recipes are created and edited by Admin only; changes affect future sales only (past orders keep their historical cost).
- A prepared recipe declares a base yield. Any requested preparation quantity scales every ingredient proportionally to that yield, rounded to the stock ledger's three-decimal quantity precision.
- Preparation never permits negative ingredient stock. The recipe, all cafe FIFO deductions, allocation snapshots, and the costed prepared-item output batch commit atomically; insufficient stock returns a conflict and changes nothing.
- Every preparation is immutable and retains recipe/output names, the administrator, time, notes, source FIFO batches, exact carried costs, and the resulting cafe batch. Recipe edits affect only later preparations.
- An active recipe protects its category, ingredient items, and prepared output item from incompatible deactivation or stock-unit/type changes. Prepared-recipe dependency cycles are rejected.

---

## 11. Waste (الهالك)

- Waste entry: warehouse (main or cafe), what was wasted, quantity, **reason** (expired, damaged, preparation mistake, spill, other + note), date, who recorded it.
- Can target:
  - a **stock item** (raw/resale/prepared) → deducts that item (FIFO), or
  - a **finished recipe product** (e.g. a dropped drink) → deducts its ingredients per the recipe/size.
- FIFO cost of every waste entry is stored and totalled in reports.
- Permissions: cashier records **cafe** waste only; admin records waste anywhere.

---

## 12. Refunds (المرتجع)

- Cashier selects the **original order** (by number or from recent orders) and refunds the **whole order or specific lines/quantities**, with a reason.
- Cash is returned to the customer; the refund **reduces the current shift's expected drawer** and is attached to the current shift.
- Stock handling:
  - **As-is items:** cashier chooses “return to stock” (unopened, sellable → back into cafe stock at its original cost) or “not returnable” (recorded as waste).
  - **Recipe products:** ingredients remain consumed; optionally the refunded drink is also logged as waste for visibility.
- Refunds appear in reports (by shift, cashier, product, reason) and reduce net sales and profit.

---

## 13. Expenses

- **Expense categories:** flat admin-managed list (rent, electricity, maintenance, cleaning, …).
- **Shift expenses:** cashier records small cash-from-drawer expenses during an open shift (amount, category, note) → reduces the shift's expected cash.
- **General expenses:** admin records any expense any time (amount, category, date, note), independent of shifts.
- Both feed the money/expense reports; salaries and advances appear in cash-flow automatically from §9 (not double-entered as expenses).

---

## 14. Reports & Dashboard

### Dashboard (Admin home)
- Today: sales, refunds, discounts, gross profit, orders count.
- Open shift status (cashier, float, running totals).
- Low-stock alerts (both warehouses) and negative-stock flags.
- Pending transfer requests.

### Reports (all filterable by date range; all printable / exportable to PDF)
1. **Sales & profit:** by day/period, by product, by category (main/sub), by shift, by cashier — revenue, FIFO COGS, gross profit, discounts, refunds.
2. **Stock & movement:** current stock with FIFO value (main + cafe), full item movement ledger (purchases, transfers, sales, waste, adjustments, preparations), low-stock list, stocktake difference history.
3. **Money & expenses:** cash flow (sales in; supplier payments, expenses, salaries, advances out), expense breakdown by category, shift over/short history, supplier outstanding balances.
4. **Employees & attendance:** hours/days per employee, attendance log, salary history with advances/bonuses/deductions.
5. **Waste & refunds:** totals and detail by item/product, reason, warehouse, period, recorded-by.
6. **Suppliers:** account statements, purchases by supplier, balances summary.

---

## 15. Data Model (core tables)

`users` (admin/cashier, credentials) · `employees` (profile, pay type/rate, PIN) · `attendance_logs` · `salary_advances` · `salary_adjustments` (bonus/deduction) · `salary_payments`
`categories` (self-referencing main/sub) · `items` (unit, conversion, type, minimums) · `stock_batches` (warehouse, item, qty remaining, unit cost, source) · `stock_movements` (ledger: type, warehouse, item, qty, cost, reference)
`suppliers` · `purchase_invoices` + `purchase_lines` · `supplier_payments`
`transfer_requests` + `transfers` + `transfer_lines`
`recipes` (product/sub-recipe) + `recipe_sizes` + `recipe_ingredients` · `preparations` (batch runs)
`shifts` · `orders` + `order_lines` (price + FIFO cost snapshot) · `refunds` + `refund_lines`
`waste_entries` · `expenses` + `expense_categories` · `stocktakes` + `stocktake_lines`

All stock changes go through `stock_movements` + `stock_batches` so every quantity and cost is traceable to a document.

---

## 16. Out of Scope (explicitly excluded)

- Multiple branches; dine-in/delivery orders; card or wallet payments.
- Expiry-date tracking; purchase returns to suppliers.
- Customer accounts/loyalty; kitchen display screens.
- English interface; currencies other than EGP.
- Excel export (PDF only).
