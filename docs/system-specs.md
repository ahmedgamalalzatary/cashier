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

#### Admin accounts (super-admin)

- The **super-admin** is the admin account defined by server settings (`ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_PASSWORD`). On every online/development API start the boot sync forces its name, username, `admin` role, NULL branch, active state, and super-admin flag; it only re-hashes the password and revokes sessions when the configured password no longer matches. A cashier may share its username and is left unchanged. Renaming the configured super-admin to another global admin's username still fails with a clear conflict error.
- The super-admin can create, edit, deactivate, and reset the password of other admins. He cannot edit his own account in the app — his data comes from server settings.
- A **regular admin** (created by the super-admin) has the same business powers as the super-admin but cannot manage any admin account — not others, not himself. The Users page is read-only for him.
- Nobody changes his own password in the app: the super-admin's comes from server settings, a regular admin's is set by the super-admin, and a cashier's is set by an admin from the employee record (an explicit reset is available for an active cashier account).

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

**Desktop/online Phase 4 login and branch rules supersede the earlier unrestricted
admin/default-Main-Branch rules above:** login explicitly chooses `admin` or `cashier`.
Admin usernames are global; cashier usernames are unique within their branch;
the two roles may share a username. The PC reads a required UUID `BRANCH_ID` from
its settings and rejects a database containing zero, different or multiple branches.
Every local business request uses that branch, including requests without a header.
The super-admin is exempt from assignment checks, but cannot select another branch
on the PC. Other admins need a current assignment; cashiers need that branch and
an active branch row. Assignment removal or branch archive blocks the affected
existing local sessions; a denied `/me` response clears the browser profile.

Local branch discovery returns only the configured branch, and branch-management
writes there are forbidden. Admins retain archived history; archived writes remain
blocked. The unpinned development API uses explicit UUID selections, filters regular
admins' branch lists/access by assignment, and rejects ambiguous same-name cashier
login. Online provisioning and the final branch-management permissions arrive in
Phases 7–9; Phase 4 does not implement those online apps or invent a default branch.

**Phase 9 accounts pull:** each linked PC downloads its own branch row, the
super-admin, assigned admins, and assignments at startup and every 15 minutes.
Only bcrypt hashes are downloaded, never plaintext passwords. The PC applies
the complete snapshot in one transaction, leaves cashiers unchanged, and
deactivates absent admins while retaining their historical identities. Changes
to passwords, activation, assignments, and branch archive state take effect
after a successful pull. Offline starts retain cached access; an admin removed
online may still sign in offline until the PC reconnects (owner decision D13).
Desktop `ADMIN_*` settings are ignored and never overwrite downloaded accounts.
Account pulls run independently of external catalog/order synchronization and
never block selling on a network request. A new PC needs its first successful
pull before its online admins can log in locally.

| Request                                        | Behavior                                           |
| ---------------------------------------------- | -------------------------------------------------- |
| `GET /api/branches`                            | Admin: every branch; cashier: assigned branch only |
| `POST /api/branches` `{ "name": "…" }`         | Admin creates an active workspace                  |
| `PUT /api/branches/:id` `{ "name": "…" }`      | Admin renames it                                   |
| `DELETE /api/branches/:id`                     | Admin archives it and revokes its cashier sessions |
| `PUT /api/branches/:id` `{ "isActive": true }` | Admin restores it                                  |

Business endpoints use UUID `X-Branch-Id`. On the PC the configured branch takes
precedence, and a differing header returns 403. On the unpinned development API,
an admin must supply a branch; a cashier defaults to its assigned UUID. Invalid
IDs return 400, missing branches 404, and archived writes 409. Auth and branch
discovery do not depend on the selected header, but enforce the PC's account access.

#### Branch rollout

- `0039_branch_workspaces` creates **الفرع الرئيسي** and preserves existing cashier assignment; `0040_branch_owned_data` assigns all existing operational rows to branch 1 without changing IDs, quantities, amounts, or history, and adds scoped uniqueness, cache keys, and owned-record references.
- Back up the database and stop the old API/worker first: older versions run unscoped queries and must not serve the multi-branch schema. Apply migrations, then start API, worker, and web together (see `docker.md`).
- MySQL DDL is not transactional. On failure, inspect the failing statement and partial schema before retrying; never blindly rerun completed DDL or remove the production volume.

### Capability matrix

| Capability                              | Admin                          | Cashier            |
| --------------------------------------- | ------------------------------ | ------------------ |
| POS sales, discounts, refunds           | ✔ (no shift, flagged as إداري) | ✔ (own shift)      |
| Open/close shift, shift expenses        | ✘                              | ✔ (own shift)      |
| Force-close, reopen, or correct a shift | ✔                              | ✘                  |
| Transfer requests (cafe → ask main)     | ✔                              | ✔ (create request) |
| Approve transfers / direct transfers    | ✔                              | ✘                  |
| Cafe waste entry                        | ✔                              | ✔                  |
| Main-warehouse waste, stocktake         | ✔                              | ✘                  |
| Items, categories, recipes, prices      | ✔                              | ✘                  |
| Application users and roles             | ✔ (super-admin manages admins) | ✘                  |
| Purchases, suppliers, payments          | ✔                              | ✘                  |
| Employees, salaries, advances           | ✔                              | ✘                  |
| General expenses, expense categories    | ✔                              | ✘                  |
| Reports & dashboard                     | ✔                              | ✘                  |

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
- **Send to cafe on save:** each line may carry a "to cafe now" amount in stock units (default 0, at most the line's stock quantity). The invoice and one direct transfer (main → cafe, FIFO, noted with the invoice number) are saved in one transaction, so either both exist or neither does. That transfer is **linked to the invoice** (`transfers.purchase_invoice_id`).
- **Invoice ⇄ cafe link:** the invoice detail lists, per line, the quantity already transferred to the cafe and the remainder still owed. A later direct transfer started from that invoice is capped to the remainder (per item, summed across the invoice's lines) and may only carry items the invoice actually bought; exceeding either returns a conflict and moves no stock. An invoice whose lines are fully transferred offers no further transfer.
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
- Admin can also create a **direct transfer** (no request) in one step. A direct transfer may optionally name the purchase invoice it moves stock for (§5); request-approved transfers are never invoice-linked.
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

- **Concurrency:** one open shift per branch, enforced by the unique `(branch_id, open_slot)` index. Different branches may each have an open shift. Orders, refunds, expenses, waste, and cashier transfer requests still require and attach to the owning cashier's branch-scoped open shift.
- **Open:** cashier logs in and enters the counted **starting float** directly on Home or POS. Both pages also offer counted-cash closing and the cashier's own paginated history. The separate Shifts page is admin-only.
- Each shift records the authenticated cashier user and, through that user's required employee link, the employee who operated it.
- A cashier's worked time sums open/reopened work segments, excluding closed gaps. Non-cashier employees have no attendance or worked-hours tracking.
- **During:** shift screen shows running totals (orders count, sales, discounts, transfer requests, refunds, expenses, and waste actions).
- **Close:** cashier counts the drawer and enters **actual cash**. System computes:
  - `expected = float + cash sales − cash refunds − shift expenses`
  - `over/short = actual − expected`
- Over/short is stored against the shift and cashier, with full history in reports.
- **Auto-close after 16 hours:** a shift left open for `MAX_SHIFT_HOURS` (16) is closed by the
  system, so a forgotten shift cannot run forever and corrupt worked time or the drawer figures.
  The drawer was never counted, so the close records `expected` only; `closedAt` is capped at
  the start of the current open segment + 16h (not "now"). A reopen starts a new segment;
  earlier worked segments still count toward total worked time. This caps each forgotten
  segment at 16 worked hours, and
  `actual_cash` / `over_short` / `closed_by_user_id` stay `NULL`. An `auto_close` audit event is
  written with no actor. An admin completes the count later with the existing correction flow.
- The sweep runs every 60 seconds across all active branches, including in the desktop
  runtime when external-order synchronization is disabled. It stops with the owned API.
- Expiry is also checked before cashier writes (sales, refunds, expenses, waste, transfers,
  and shift operations) and when a cashier asks for their current shift. The system close
  commits before the business operation starts, so rejecting that operation cannot undo
  the close. POS and Home show "no shift open", and a sale receives the normal 409 until
  a new shift is opened. Cashiers see a warning an hour before the 16-hour limit.
- Admin can view shifts, force-close a shift left open, and reopen/correct a closed shift with an audit note. Admin cannot open a shift.
- Admin Home and Shifts show the branch's open shift. Reopening conflicts whenever that branch already has an open shift, including one owned by another cashier. History pages retain access beyond 100 records and expose audit events and cash snapshots.
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

Open, close, admin-close, reopen, and correction routes keep their payloads. A duplicate open/reopen in the same branch returns 409; a cashier cannot close another cashier's shift, and admin actions are limited to the selected branch.

#### Shift rollout

Desktop/online Phase 4 restores the unique `(branch_id, open_slot)` index: open shifts
use slot 1; counted, admin and system closes release the slot with NULL. This replaces
the earlier per-cashier concurrency introduced by `0041_cashier_concurrent_shifts`.
The UUID schema is verified in slice 4.2; activating it on existing demo databases waits
for the 4.3 baseline reset and the remaining API ID conversion in 4.4. Do not apply the
new schema to an old runtime during the intermediate slices.

---

## 9. Employees & Salaries

### Employee records

- Fields: name, phone, job title, hire date, monthly salary, notes, active flag.
- Payroll is **monthly only**: the salary field holds the monthly salary and an empty value means it was never set. There is no daily or hourly pay type, and a request carrying one is rejected rather than silently stored as a monthly salary.
- Employees are static HR/payroll records with no login permission by default. Admin can grant or revoke cashier access from an employee record without replacing that record or losing its history.
- Non-cashier employees have no PIN, system login, attendance, or worked-hours tracking.
- For a cashier, each shift records worked duration and all actions performed during that shift.

### Salaries

- **Monthly salary:** one amount per employee; empty means the salary was never set and the employee is not payable.
- **Advances (سلف):** recorded any time; cash out immediately (appears in cash-flow); accumulates against the employee until payday.
- **Bonuses / deductions:** dated entries with amounts and notes.
- **Payday screen:** for a chosen period per employee —
  `net = monthly salary + bonuses − deductions − advances` → confirm to record the salary payment, showing the net amount in the confirmation. Full salary history retained. Payday is one calendar month at a time. A month on or before the latest paid month cannot be paid; the payday screen shows those months as not payable. Net pay is computed in integer cents so two-decimal amounts do not drift.
- **Why a month is not payable:** every month row carries the real reason instead of a single generic message —
  `no_salary` (set the monthly salary), `month_closed` (a later month was already paid), or `invalid_data` (the numbers themselves are inconsistent: broken advances or a negative net), the last carrying the underlying message.
- **Earlier unpaid months:** a row also reports how many months between the last payment and the shown month are still unpaid. With no payment history the gap is measured from the hire month instead, so paying an employee's first month warns about the months they already worked. Paying this month locks them for good, so the confirmation warns about them before the payment is recorded.

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

`users` (admin/cashier, credentials, one-to-one employee link required for cashiers) · `employees` (profile, monthly salary; no PIN/login by default) · `salary_advances` · `salary_adjustments` (bonus/deduction) · `salary_payments`
`categories` (self-referencing main/sub) · `items` (unit, conversion, type, minimums) · `stock_batches` (warehouse, item, qty remaining, unit cost, source) · `stock_movements` (ledger: type, warehouse, item, qty, cost, reference)
`suppliers` · `purchase_invoices` + `purchase_lines` · `supplier_payments`
`transfer_requests` + `transfers` (+ optional branch-scoped `purchase_invoice_id`) + `transfer_lines`
`recipes` (product/sub-recipe) + `recipe_sizes` + `recipe_ingredients` · `preparations` (batch runs)
`shifts` + `shift_events` · `orders` + `order_lines` (price + FIFO cost snapshot) · `refunds` + `refund_lines`
`waste_entries` · `expenses` + `expense_categories` · `stocktakes` + `stocktake_lines`

All stock changes go through `stock_movements` + `stock_batches` so every quantity and cost is traceable to a document.

`branches` stores workspace lifecycle. Operational tables carry `branch_id`; local uniqueness and external IDs are scoped by branch. Composite references prevent cross-branch links between owned records. Global administrator identities remain shared; cashier/employee assignment and all operational reads/writes are branch-scoped.

Desktop/online Phase 4 schema rules:

- Business keys and their references use app-generated UUIDv7 strings stored as
  `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`. External-system IDs remain numeric.
- Branch scope is explicit; database helpers do not invent a default branch. Admin
  `users.branch_id` is NULL; cashiers require their branch's UUID. Cashier usernames
  are unique within a branch, admin usernames globally, and the two roles may share a
  username. Explicit-role account lookup, local assignment enforcement and role-aware
  seed integration are completed in Phase 4.6.
- `admin_branches` stores admin-to-branch assignments. `devices` permits one linked
  device per branch. `link_codes` stores code hashes, expiry and usage times.
- `sync_outbox` captures every business insert/update/delete in the same transaction,
  including cashier password hashes; online-owned accounts and bookkeeping are excluded.
  The session flag `@cashier_sync_apply = 1` suppresses capture during accounts pull/ingest.
  Keys include branch ownership and composite primary keys; full rows retain nulls and
  represent DECIMAL values as strings. Recipe-size replacement explicitly clears historical
  order-line references so foreign-key side effects are captured too.
- Auto-increment sequence numbers are allocated before commit, so they are not a commit-order
  cursor. Uploads must retain every unconfirmed row and delete only exact acknowledged
  sequences from the sent batch. `sync_state` has one row (`id = 1`); its
  `last_uploaded_seq` is diagnostic only. Ingest/uploader workers arrive in later slices.
- The three external-ingredient mapping tables have composite primary keys over their
  branch, external target and local item. Existing branch-scoped foreign keys remain enforced.

---

## 16. Out of Scope (explicitly excluded)

- Dine-in/delivery POS orders; card or wallet payments.
- Expiry-date tracking; purchase returns to suppliers.
- Customer accounts/loyalty; kitchen display screens.
- English interface; currencies other than EGP.
- Excel export (PDF only).
