# Cashier + Warehouse System — Specification

**Date:** 2026-07-19 (amended 2026-09-19 — internal POS sales restored; 2026-09-27 — independent branch workspaces; 2026-10-06 — branch, shift, and report details merged in from their separate docs)
**Status:** Approved by owner
**Scope:** Multiple independent branches — each has one main warehouse + one cafe (sub-warehouse)

---

## 1. Overview

A cloud-hosted web application combining a cafe POS (cashier) with warehouse/inventory management. Goods are purchased from suppliers into the **main warehouse**, transferred on request to the **cafe**, and sold as stock items. Preparation consumes ingredients before sale and receives a finished stock item; sale consumes that finished item or an as-is item. The system also manages shifts, employee records, salaries, expenses, waste, refunds, and full reporting.

| Decision   | Locked choice                                                |
| ---------- | ------------------------------------------------------------ |
| Deployment | Cloud web app (internet required at shop)                    |
| Roles      | Admin + Cashier                                              |
| Language   | Arabic only, RTL layout                                      |
| Currency   | EGP                                                          |
| Branches   | Independent workspaces; main warehouse + cafe in each branch |
| Costing    | FIFO with purchase batches                                   |
| Stack      | Next.js frontend + Express.js backend + MySQL (Drizzle ORM)  |

---

## 2. Architecture & Tech Stack

- **Frontend:** Next.js (React, TypeScript), fully RTL Arabic UI. POS screen optimized for fast touch/mouse use.
- **Backend:** Express.js REST API (TypeScript), JWT-based auth with role checks on every endpoint.
- **Database:** MySQL (InnoDB, utf8mb4) accessed via Drizzle ORM (drizzle-kit migrations). All money stored as `DECIMAL`, all quantities as `DECIMAL` (fractional units supported).
- **Printing:** 80mm thermal receipts rendered as an Arabic print view; browser print to the printer attached to the cashier PC. Auto-print after each sale.
- **PDF export:** browser Print / Save as PDF with Arabic report labels for every report (owner-confirmed 2026-09-27).

### Roles & permissions

Branch access is enforced independently of the capability matrix below. Admins manage/select all branches; each cashier belongs to one branch and cannot change it. Revised cashier capabilities and transaction correction (edit/delete with reversal and retained history) remain open; branch isolation does not implement them.

Only admins and cashiers can sign in. An employee record is a staff/HR record and has no system access by default.

- An admin can grant an employee cashier access ("promote to cashier"). This creates one linked `users` account with the `cashier` role and login credentials.
- Every cashier user must be linked one-to-one to an employee record. Employees without a linked user remain staff/payroll records only.
- The employee keeps the same salary, advance, adjustment, and cashier shift history after cashier access is granted or revoked.
- Revoking or deactivating the linked user blocks login without deleting or deactivating the employee record.
- Cashier actions are stored against the authenticated user and are reportable through the linked employee, including shifts, orders, discounts, refunds, shift expenses, waste entries, and transfer requests where applicable.
- There is no employee PIN or standalone attendance clock. Only cashiers have worked-time tracking, derived from their shift open and close times.

### Branch workspaces

- Admin creates, renames, archives, and restores branches from the Branches page and selects the active workspace from the application header.
- Existing records and cashier accounts migrate to **الفرع الرئيسي** (Main Branch). New branches start without operational records; cached online catalog data can be copied, with stock ingredient/modifier setup reset for independent configuration.
- Every branch owns its employees/payroll, categories/items, supplier accounts, purchases, stock/batches/movements, recipes/preparations, transfer queue, shifts, orders, refunds, expenses, waste, catalog configuration, and report data.
- A cashier account belongs to exactly one branch through its employee record. Moving a person to another branch requires a new employee/account record; past records remain in the original branch.
- Admin identities are global and may act within any selected workspace. Application requests carry `X-Branch-Id`; the server validates the selection against the current account. Cashiers default to their assigned branch and cannot override it.
- Archive preserves history, blocks cashier login and operational writes, and skips worker refreshes. Admin can read archived records and restore the branch. A branch with an open shift, or the last active branch, cannot be archived.
- Background catalog/order caching runs separately in each active branch with independent refresh state and leases. Online order stock deduction is a separate pending feature.
- **Using branches:** open **الفروع** (admin) to add, rename, archive, or restore. Select **الفرع الحالي** in the header (or **فتح الفرع** in the list); the workspace opens on Home and forms/carts/page state reset on a switch. To staff a branch, create the employee inside that workspace and grant cashier access; the account inherits the employee's branch.
- New workspaces copy only cached catalog data. Ingredient mappings, modifier stock effects, stock, staff, and transactions are not copied; each branch configures its catalog stock setup independently.
- Internal IDs stay globally unique; local item codes, request keys, and external catalog/order IDs may repeat across branches. Composite foreign keys protect owned-record references. The browser remembers the selected branch per account, but authorization always reads the account's real assignment, and responses that arrive after a branch/account switch are discarded.

#### Branch API

| Request                                        | Behavior                                           |
| ---------------------------------------------- | -------------------------------------------------- |
| `GET /api/branches`                            | Admin: every branch; cashier: assigned branch only |
| `POST /api/branches` `{ "name": "…" }`         | Admin creates an active workspace                  |
| `PUT /api/branches/:id` `{ "name": "…" }`      | Admin renames it                                   |
| `DELETE /api/branches/:id`                     | Admin archives it and revokes its cashier sessions |
| `PUT /api/branches/:id` `{ "isActive": true }` | Admin restores it                                  |

Business endpoints select the workspace with `X-Branch-Id`. Admin defaults to Main Branch when no header is sent; a cashier defaults to its assigned branch and gets 403 for any other. Invalid IDs return 400, missing branches 404, and writes into an archived workspace 409. Auth and branch-management endpoints do not depend on the selection.

#### Branch rollout

- `0039_branch_workspaces` creates **الفرع الرئيسي** and preserves existing cashier assignment; `0040_branch_owned_data` assigns all existing operational rows to branch 1 without changing IDs, quantities, amounts, or history, and adds scoped uniqueness, cache keys, and owned-record references.
- Back up the database and stop the old API/worker first: older versions run unscoped queries and must not serve the multi-branch schema. Apply migrations, then start API, worker, and web together (see `docker.md`).
- MySQL DDL is not transactional. On failure, inspect the failing statement and partial schema before retrying; never blindly rerun completed DDL or remove the production volume.

### Capability matrix

| Capability                              | Admin | Cashier            |
| --------------------------------------- | ----- | ------------------ |
| POS sales, discounts, refunds           | ✘     | ✔                  |
| Open/close shift, shift expenses        | ✘     | ✔ (own shift)      |
| Force-close, reopen, or correct a shift | ✔     | ✘                  |
| Transfer requests (cafe → ask main)     | ✔     | ✔ (create request) |
| Approve transfers / direct transfers    | ✔     | ✘                  |
| Cafe waste entry                        | ✔     | ✔                  |
| Main-warehouse waste, stocktake         | ✔     | ✘                  |
| Items, categories, recipes, prices      | ✔     | ✘                  |
| Application users and roles             | ✔     | ✘                  |
| Purchases, suppliers, payments          | ✔     | ✘                  |
| Employees, salaries, advances           | ✔     | ✘                  |
| General expenses, expense categories    | ✔     | ✘                  |
| Reports & dashboard                     | ✔     | ✘                  |

---

## 3. Categories (Main → Sub)

- Two-level category tree used by **both** warehouse items and sale products.
- **Main category** (e.g. مشروبات ساخنة) contains **sub-categories** (e.g. قهوة، شاي).
- An item/product attaches to a sub-category, or directly to a main category that has no subs.
- POS: main categories as tabs, sub-categories as a filter row for **internal** products; external catalog renders as a separate flat group alongside (see §7). Both navigations coexist.
- Decision (amended 2026-09-28): POS sells local as-is resale items under main/sub tabs alongside a separate flat external catalog. Local prepared-result sales remain a separate implementation gap. Categories do not determine whether a stock item is sold or used as an ingredient.
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
- Enters actual counted quantities; system shows difference vs. recorded stock. Every line needs a typed count before save or confirm; an empty box is missing, not zero. Typed `0` means the shelf is empty.
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
- **Send to cafe on save:** each line may carry a "to cafe now" amount in stock units (default 0, at most the line's stock quantity). The invoice and one direct transfer (main → cafe, FIFO, noted with the invoice number) are saved in one transaction, so either both exist or neither does.
- **Payment on invoice:** paid in full, partial, or fully on credit (آجل). Unpaid remainder increases the supplier's balance.
- Confirmed purchase invoices are immutable so their FIFO batches and supplier accounting cannot drift; corrections use explicit stock/accounting adjustments rather than editing history.
- **Supplier payments:** recorded any time against the supplier balance (amount, date, note); shown in the statement. A payment does not change any invoice's paid amount, which stays what was paid at purchase.
- **No purchase returns** — damaged/rejected goods are recorded as waste (§11).

---

## 6. Cafe Sub-Warehouse & Transfers

- The cafe holds its own stock (with its own FIFO batches carried over from main).
- **Request → approve flow:**
  1. Cashier creates a **transfer request**: items + quantities + note.
  2. Admin reviews, may edit each requested quantity (without adding or dropping item lines), then **approves** → stock moves main → cafe immediately; or **rejects** with a reason.
- Cashiers and admins working in the same branch see that branch's cafe request queue. Other branches have separate queues. Request lines preserve the originally requested quantities; approved quantities are stored on the resulting transfer.
- Approval is atomic. If any approved quantity is unavailable in the main warehouse, no stock moves, the API returns a conflict, and the request remains pending for adjustment and retry.
- Admin can also create a **direct transfer** (no request) in one step.
- Reviewed requests and completed transfers are immutable audit records. Every transfer document lists items, quantities, source and cafe batch IDs, carried FIFO costs, requester, approver, and timestamps.

---

## 7. POS (Sales)

- **Order type:** takeaway only.
- Flow: product grid (local main/sub tabs + separate flat external group) → cart with quantities/sizes → cash received → change computed → order saved → receipt auto-prints. An order may mix local and imported products.
- **Current sale line types, stored in `order_lines.type`:**
  1. `external_product` — flat external catalog item (existing flow). Price from catalog (minus catalog discount) + modifier extras. Deducts mapped ingredients (`external_*_ingredients`) from **cafe stock** (FIFO).
  2. `item` — local as-is **resale item** (`items.type='resale'`, `items.sellingPrice`). The server reads its stored price and deducts the item itself (FIFO) from **cafe stock**, with no recipe required. Each imported menu flavor/size can be a separate local item.
- `recipe` lines are legacy records; new checkout does not accept them. The owner-confirmed prepared-result model consumes a prepared output stock item at sale, not recipe ingredients. Local prepared pricing/sales and explicit imported recipe/output links remain unimplemented.
- Sales are allowed even if computed stock would go negative (the shop can't stop selling because of a data entry gap); negative stock is flagged on the dashboard for correction.
- **Payments:** cash only. Received amount + change recorded.
- **Discounts:** percentage or fixed amount per order; cashier applies freely; every discount is stored with order, cashier, and shift, and is visible in reports.
- **Receipt:** 80mm Arabic thermal receipt — shop name, date/time, order number, cashier, lines (product/size/qty/price), discount, total, received, change. Auto-print, with a reprint option.
- Every order records: cashier, shift, timestamp, lines with unit price and FIFO cost at sale time (for profit reports).

---

## 8. Shifts

- **Concurrency:** one open shift per cashier account, with multiple cashiers able to work simultaneously within/across branches. The database enforces the cashier account limit. Orders, refunds, expenses, waste, and cashier transfer requests require and attach to the owning cashier's branch-scoped open shift.
- **Open:** cashier logs in and enters the counted **starting float** directly on Home or POS. Both pages also offer counted-cash closing and the cashier's own paginated history. The separate Shifts page is admin-only.
- Each shift records the authenticated cashier user and, through that user's required employee link, the employee who operated it.
- A cashier's worked time sums open/reopened work segments, excluding closed gaps. Non-cashier employees have no attendance or worked-hours tracking.
- **During:** shift screen shows running totals (orders count, sales, discounts, transfer requests, refunds, expenses, and waste actions).
- **Close:** cashier counts the drawer and enters **actual cash**. System computes:
  - `expected = float + cash sales − cash refunds − shift expenses`
  - `over/short = actual − expected`
- Over/short is stored against the shift and cashier, with full history in reports.
- Admin can view shifts, force-close a shift left open, and reopen/correct a closed shift with an audit note. Admin cannot open a shift.
- Admin Home and Shifts show every open shift in the selected branch. Reopening conflicts only when that cashier already has an open shift. History pages retain access beyond 100 records and expose audit events and cash snapshots.
- **Controls:** cashiers use **فتح وردية** / **إغلاق وعدّ الدرج** on Home or POS, and **سجل وردياتي** for their own paginated history (**تفاصيل الوردية** shows totals, closing time, and audit events). Admin uses the **الورديات** page to force-close with a note, reopen, or correct float/actual cash with a note.

#### Shift API

All requests use the authenticated branch selection.

| Request                              | Result                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `GET /api/shifts/current`            | Cashier: own open shift or `null`; admin: `null` (no personal cashier shift)                  |
| `GET /api/shifts/active`             | Admin: all open shifts in the selected branch                                                 |
| `GET /api/shifts/today`              | All shifts opened on today's Cairo calendar date; cashier: own shifts, admin: selected branch |
| `GET /api/shifts?limit=100&offset=0` | Paginated history; limit 1–100, offset nonnegative; same ownership rules                      |
| `GET /api/reports/dashboard`         | `openShifts`: every open shift in the selected branch                                         |

Open, close, admin-close, reopen, and correction routes keep their payloads. A duplicate open/reopen for one cashier returns 409; a cashier cannot close another cashier's shift, and admin actions are limited to the selected branch.

#### Shift rollout

`0041_cashier_concurrent_shifts` replaces the unique `(branch_id, open_slot)` index with `(cashier_user_id, open_slot)` (open shifts use slot 1, closed use NULL), preserving every record, ID, total, and event. Stop the old API/worker before migrating: the old app assumes one shift per branch. Start the updated API, web, and worker together.

---

## 9. Employees & Salaries

### Employee records

- Fields: name, phone, job title, hire date, pay type + rate, notes, active flag.
- Employees are static HR/payroll records with no login permission by default. Admin can grant or revoke cashier access from an employee record without replacing that record or losing its history.
- Non-cashier employees have no PIN, system login, attendance, or worked-hours tracking.
- For a cashier, each shift records worked duration and all actions performed during that shift.

### Salaries

- **Pay types (per employee):**
  - Monthly: fixed amount per month.
  - Daily: stored daily rate; worked days are not automatically tracked for non-cashiers.
  - Hourly: stored hourly rate; automatic worked hours are available only for cashiers from their shifts.
- **Advances (سلف):** recorded any time; cash out immediately (appears in cash-flow); accumulates against the employee until payday.
- **Bonuses / deductions:** dated entries with amounts and notes.
- **Payday screen:** for a chosen period per employee —
  `net = computed pay + bonuses − deductions − advances` → confirm to record the salary payment. Full salary history retained. Payday is one calendar month at a time. A month on or before the latest paid month cannot be paid; the payday screen shows those months as not payable. Net pay is computed in integer cents so two-decimal amounts do not drift.

---

## 10. Recipes

- **Preparation recipes** (`recipes.type='prepared'`) consume cafe-stock ingredients (raw, resale, or prepared) and produce a finished stock item (e.g. 1L sugar syrup). Admin runs **“prepare batch”** with a produced quantity → ingredients are deducted (FIFO) from cafe stock and a new batch of the prepared item is added at the computed ingredient cost.
- A prepared output may be an ingredient or a finished result for sale. The confirmed sale model deducts its prepared stock, without consuming ingredients again. Local prepared-result pricing/sales and explicit imported recipe/output links remain separate open work; the current POS local catalog contains resale items only.
- **Live costing:** each recipe/size shows its current FIFO ingredient cost next to its selling price (cost %, margin) to guide pricing.
- Recipes are created and edited by Admin only; changes affect future preparations only (past preparations and orders keep their historical cost).
- A prepared recipe declares a base yield. Any requested preparation quantity scales every ingredient proportionally to that yield, rounded to the stock ledger's three-decimal quantity precision.
- Preparation never permits negative ingredient stock. The recipe, all cafe FIFO deductions, allocation snapshots, and the costed prepared-item output batch commit atomically; insufficient stock returns a conflict and changes nothing.
- Every preparation is immutable and retains recipe/output names, the administrator, time, notes, source FIFO batches, exact carried costs, and the resulting cafe batch. Recipe edits affect only later preparations.
- An active recipe protects its category, ingredient items, and prepared output item from incompatible deactivation or stock-unit/type changes. Prepared-recipe dependency cycles are rejected.

---

## 11. Waste (الهالك)

- Waste entry: warehouse (main or cafe), what was wasted, quantity, **reason** (expired, damaged, preparation mistake, spill, other + note), date, who recorded it.
- Can target:
  - a **stock item** (raw/resale/prepared) → deducts that item (FIFO), or
  - a **finished prepared result** (e.g. a dropped drink) → deducts its finished stock item, not ingredients again. The legacy recipe waste path still consumes ingredients and remains an open issue.
- FIFO cost of every waste entry is stored and totalled in reports.
- Permissions: cashier records **cafe** waste only; admin records waste anywhere.

---

## 12. Refunds (المرتجع)

- Cashier selects the **original order** (by number or from recent orders) and refunds the **whole order or specific lines/quantities**, with a reason.
- Cash is returned to the customer; the refund **reduces the current shift's expected drawer** and is attached to the current shift.
- Stock handling per line type:
  - **As-is items (`item` resale + `external_product` not-returnable path):** cashier chooses “return to stock” (unopened, sellable → back into cafe stock at its original cost) or “not returnable” (recorded as waste).
  - **Legacy recipe records (`recipe`):** ingredients remain consumed. New checkout rejects recipe lines; future prepared-result sales must use finished item allocations rather than restoring ingredients.
  - **External products (`external_product`):** `return_to_stock` restocks each mapped ingredient; `not_returnable` writes a waste entry linked to the refund line.
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
4. **Employees & worked time:** cashier shift hours and actions by employee; salary history with advances/bonuses/deductions for all employees.
5. **Waste & refunds:** totals and detail by item/product, reason, warehouse, period, recorded-by.
6. **Suppliers:** account statements, purchases by supplier, balances summary.
7. **Transfers & preparation:** executed main-to-cafe transfers, request status/review, recipe preparation output and consumed ingredients, quantities, FIFO costs, and responsible staff.

The Reports page is admin-only and reads the selected branch. Supplier reports complement the full statements on the Suppliers page.

#### Dates and amounts

- `from` and `to` are inclusive Cairo calendar dates. Timestamp queries use `[first instant of from, first instant of the day after to)`, including days where daylight saving skips midnight.
- Timestamps are stored and sent as UTC and displayed in Cairo time. Expense, purchase/payment, and salary advance/adjustment dates stay calendar dates; no time is invented. The database pool uses UTC so the host timezone cannot shift report boundaries.
- All sections read one read-only REPEATABLE READ transaction, so concurrent writes cannot make sections describe different states.
- The response `range` carries `from`, `to`, `branchId`, and `generatedAt`. Editing the date controls does not relabel loaded figures; refresh clears the old report, and a pending or failed refresh cannot be printed. Late responses, including ones from a previous branch, are ignored.
- Stock quantities/value/alerts and supplier balances are **current snapshots** at generation, not historical closing balances. Transfer-request status and stocktakes show their current state but are selected by creation date.
- **Gross profit** = `sales − refunds − sales cost + returned cost`. Expenses, salaries, and waste are not deducted. Discounts are already inside the stored sale total and are not subtracted again.
- Sales by shift counts only orders/refunds timestamped inside the period, including shifts opened earlier or reopened. Lifetime shift totals and the latest cash reconciliation appear separately.
- Shift over/short lists close, admin-close, and correction events **dated within the period**; each row is a whole-shift snapshot at that event. Repeated snapshots of one shift are history, not additive gains/losses.
- A closed gap between shift segments adds no worked minutes and no worked-shift count. Sub-minute segments are summed before rounding down to whole minutes.

#### Print / Save as PDF

Select a report group, load its dates, then choose **طباعة / PDF** and use the browser's Save as PDF destination (owner-accepted; there is no separate PDF service). Printed output shows the branch, loaded date range, Cairo timezone, generation time, scope notes, and the selected group's tables.

#### Report API

`GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` returns every group, including `operations` (`transfers`, `transferLines`, `requests`, `requestLines`, `preparations`, `ingredients`), `money.expenses`, `employees.shiftHistory`, `suppliers.purchaseLines`, `sales.byShift` with period and lifetime figures, and `money.shiftOverShort` as dated event snapshots. Deploy matching API and web versions together.

#### Pending

Online revenue counted once for completed orders, per-branch online stock costs, and transaction edit/delete history depend on the unfinished online-order and correction features. Cached online summaries are not counted as POS revenue or cash flow.

---

## 15. Data Model (core tables)

`users` (admin/cashier, credentials, one-to-one employee link required for cashiers) · `employees` (profile, pay type/rate; no PIN/login by default) · `salary_advances` · `salary_adjustments` (bonus/deduction) · `salary_payments`
`categories` (self-referencing main/sub) · `items` (unit, conversion, type, minimums) · `stock_batches` (warehouse, item, qty remaining, unit cost, source) · `stock_movements` (ledger: type, warehouse, item, qty, cost, reference)
`suppliers` · `purchase_invoices` + `purchase_lines` · `supplier_payments`
`transfer_requests` + `transfers` + `transfer_lines`
`recipes` (product/sub-recipe) + `recipe_sizes` + `recipe_ingredients` · `preparations` (batch runs)
`shifts` + `shift_events` · `orders` + `order_lines` (price + FIFO cost snapshot) · `refunds` + `refund_lines`
`waste_entries` · `expenses` + `expense_categories` · `stocktakes` + `stocktake_lines`

All stock changes go through `stock_movements` + `stock_batches` so every quantity and cost is traceable to a document.

`branches` stores workspace lifecycle. Operational tables carry `branch_id`; local uniqueness and external IDs are scoped by branch. Composite references prevent cross-branch links between owned records. Global administrator identities remain shared; cashier/employee assignment and all operational reads/writes are branch-scoped.

---

## 16. Out of Scope (explicitly excluded)

- Dine-in/delivery POS orders; card or wallet payments.
- Expiry-date tracking; purchase returns to suppliers.
- Customer accounts/loyalty; kitchen display screens.
- English interface; currencies other than EGP.
- Excel export (PDF only).
