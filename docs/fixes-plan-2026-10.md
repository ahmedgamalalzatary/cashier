# Fixes plan — October 2026 (desktop beta feedback)

Status: **decided — ready to implement.** Every decision here is also recorded in
`docs/system-specs.md` (marked "owner decision 2026-10-15"). The spec is the source of truth
once this file is deleted. If the two disagree, stop and ask the owner.

## How to use this plan

- Work **phase by phase, slice by slice, in order**. Phases go from the smallest change to the
  largest. A slice is one reviewable unit: finish it, check it, then move on.
- Each slice lists **Now** (what exists today, with file references), **Goal** (what must be
  true after), **Changes**, and **Done when** (acceptance checks).
- Follow `AGENTS.md`: red/green TDD per slice, read whole related files before changing them,
  and never commit unless the owner asks.
- **Checks per slice:** run `lint`, `typecheck` and `test` only for the packages the slice
  touches, one command at a time (they can conflict when run in parallel):
  `pnpm --filter <package> lint`, `… typecheck`, `… test`. Packages: `@cashier/web`,
  `@cashier/web-core`, `@cashier/api` (its `test` also runs MySQL tests), `@cashier/server-core`,
  `@cashier/shared`, `@cashier/db`, `@cashier/online-api`, `@cashier/online-web`.
- **End of a phase that touches API + shared + web:** run the full `pnpm lint`,
  `pnpm typecheck`, `pnpm test`.
- File references are as of 2026-10-15. Line numbers can drift, so search for the code if a line
  doesn't match.

## Phase overview

| Phase | Theme                                     | Slices | Touches                      | Ships in                    |
| ----- | ----------------------------------------- | ------ | ---------------------------- | --------------------------- |
| 1     | Quick UI fixes                            | 5      | web                          | release A                   |
| 2     | Page structure (forms → modals, merge)    | 4      | web                          | release A                   |
| 3     | Orders and purchases actions, cost leak   | 4      | web, api, shared             | release A                   |
| 4     | Prints                                    | 4      | web (+ small api reads)      | release A                   |
| 5     | Business rules (payments, negative stock) | 2      | api, web, shared             | release A                   |
| 6     | Reports redesign                          | 6      | web-core, server-core, both  | release A (desktop+online)  |
| 7     | Online orders take from stock             | 6      | db, api, online-api/web, web | release B (database change) |

**Release A** is one desktop patch release after phase 6. The release deploys the online site
first (`apps/desktop/README.md` "Publishing a release"), which covers phase 6 online. **Release
B** is phase 7 alone: it changes the database, so it must never share a release with another
database change (`apps/desktop/README.md:209`).

Old item numbers from earlier drafts are shown as _(was #n)_ for traceability.

---

## Phase 1 — Quick UI fixes

No API changes. Each slice is a few lines in one or two files.

### 1.1 Mobile menu button on the drawer's side _(was #1)_

- **Now:** the page is RTL (`apps/web/src/app/layout.tsx:27`). The drawer opens from the right
  (`components/layout/sidebar.tsx:83`, `start-0`), but the mobile header puts ☰ on the left
  (`components/layout/app-shell.tsx:39-53`: logo first, then the button, `justify-between`).
- **Goal:** below `lg` width, ☰ sits on the right, on the same side as the drawer.

  ```
  now:  [☰ ............ الكافيه ☕]   drawer slides in from the RIGHT
  goal: [.............. الكافيه ☕ ☰]
  ```

- **Changes:** render the button before the logo in the header and swap `-me-2` → `-ms-2`.
- **Done when:** at mobile width ☰ is at the right edge, and opening/closing the drawer and
  Escape still work. Desktop width is unchanged.

### 1.2 Online orders: customer name only _(was #3)_

- **Now:** the customer cell shows the name and the phone under it
  (`components/orders/external-orders-panel.tsx:164-177`).
- **Goal:** the cell shows the name only.
- **Changes:** remove the phone line from the cell. Keep the search placeholder and phone search,
  and leave the printed slip unchanged.
- **Done when:** the cell shows only the name, and searching by phone still finds the order.

### 1.3 Admin refund button on the order page _(was #8)_

- **Now:** `app/orders/detail/page.tsx:84` shows **مرتجع** only when `!isAdmin`. The API already
  accepts admin refunds without a shift (`apps/api/src/modules/refunds/refunds.service.ts:120`).
- **Goal:** admins see **مرتجع** on the order page too, and it opens the same `RefundOrderModal`.
- **Done when:** an admin can refund from the order page, and the refund is saved as an admin
  refund (no shift).

### 1.4 Backup bar shows the last automatic check _(was #7)_

- **Now:** the bar re-reads `/api/sync/status` every 15 s (`components/layout/backup-card.tsx:106-122`)
  but shows only `lastSuccessAt`. When nothing new is pending, the 15-minute upload never contacts
  the site, so "last upload" doesn't move (`apps/api/src/desktop/upload.ts:192-269`,
  `backup-client.ts:101-106`). `lastAttemptAt` is already returned but not shown.
- **Goal:** the bar shows two lines: `تم آخر رفع …` (lastSuccessAt, unchanged) and
  `آخر فحص تلقائي …` (lastAttemptAt), so it visibly moves every 15 minutes.
- **Changes:** `BackupCardView` only. No backend change.
- **Done when:** a view test covers both lines, including `lastAttemptAt = null`.

### 1.5 Print a receipt from the cashier orders list _(was #2, plus the order-page part of #12)_

- **Now:** the online tab has a per-row print (`external-orders-panel.tsx:125-130`, `:302-309`).
  The cashier tab (`app/orders/page.tsx`) has no row actions. The order page prints the receipt
  from a `hidden print:block` div inside the page (`orders/detail/page.tsx:264-266`), so the page
  behind it can feed blank receipt paper. `PrintSlip` exists to prevent that
  (`components/print/print-slip.tsx`).
- **Goal:** every cashier order row has a print icon that prints the 80mm `OrderReceipt`. The
  order page prints through `PrintSlip` too.
- **Changes:** add an `actions` column with an `IconButton`. On click, load `getOrder(id)` (the
  list only holds `OrderSummary`), then `flushSync` it into a `PrintSlip` and call
  `window.print()`, the same pattern as the online tab. Disable the button while it loads, and
  show a load error in the page banner. Move the order page's receipt into `PrintSlip`.
- **Done when:** both prints produce one 80mm receipt with no trailing blank paper.

---

## Phase 2 — Page structure

UI only. The rule (spec §2 "UI conventions") is that entry forms open in a modal from a header
button, and the list stays visible behind it.

### 2.1 Waste and expenses: forms into modals _(was #5)_

- **Now:** waste (`app/waste/page.tsx:105-114`, `WasteEntryForm`) and expenses
  (`app/expenses/page.tsx:105-118`, `ExpenseEntryForm`) render the form inline above the list.
- **Goal:** the header has **تسجيل هالك** / **تسجيل مصروف** buttons that open a `Modal` with the same
  form. The modal closes and the list refreshes after saving. Expense **categories** stay an
  inline admin section.
- **Changes:** make `WasteEntryForm` accept optional preset props (warehouse and an allowed
  target list) now, because slice 3.3 reuses it.
- **Done when:** both pages work for admin and cashier with the same validation, and the cashier
  shift rule is unchanged.

### 2.2 Stocktakes: two modals _(was #5)_

- **Now:** `app/stocktakes/page.tsx:190-260` renders "جلسة جرد جديدة" and "تسوية صنف واحد" side by
  side inline.
- **Goal:** two header buttons, **جرد جديد** and **تسوية صنف**, each opening its own modal. The
  stocktake list and the open session stay on the page.
- **Done when:** starting a session and making a manual adjustment work as before, and the
  warehouse switch inside the adjustment modal still reloads stock.

### 2.3 Employees and salaries on one page _(was #17)_

- **Now:** two pages (`app/employees/page.tsx`, `app/salaries/page.tsx`) and two sidebar entries
  (`packages/web-core/src/lib/navigation.ts:34-35`, `components/layout/sidebar.tsx:49`). Admin-only
  path protection is derived from the sidebar list (`ADMIN_PATHS`).
- **Goal:** `/employees` has tabs **الموظفين | المرتبات**, with the tab kept in the URL
  (`?tab=salaries`). The **المرتبات** sidebar entry and its icon mapping are removed, and the
  `/salaries` route is **deleted**. A leftover route would lose its admin guard, and nothing else
  links to it.
- **Changes:** move the salaries page body into `components/salaries/salaries-tab.tsx`, unchanged
  in this slice.
- **Done when:** both tabs work, the URL tab survives a reload, `/salaries` no longer exists, and
  a cashier can't open `/employees`.

### 2.4 Salaries: advance form in a modal, "partial salary" wording _(was #11 + #6)_

- **Now:** the salaries tab renders "تسجيل سلفة أو تسوية" inline (the old `salaries/page.tsx:183-240`).
  Paying part of a salary early already works as an **advance**, which is deducted at payday
  (`apps/api/src/modules/salaries/salaries.service.ts:44-48`). The screen never says how much was
  paid so far.
- **Goal:** a header button opens the advance/adjustment form in a modal. The advance action is
  labelled **صرف جزء من الراتب** (the type option keeps the word سلفة in brackets). Each employee
  row shows **صُرف حتى الآن** (the month's advances) and **المتبقي** (net still due) for the
  selected month. Example: salary 5,000, advance 2,000 → paid so far 2,000, remaining 3,000.
- **Changes:** UI only. The month response already returns `advances` and per-employee figures.
- **Unchanged (spec §9):** one salary payment per month; nothing can be added after a month is
  paid; advances above a month's net block that month.
- **Done when:** the example above shows correctly, and a paid month shows the payment, not
  "remaining".

---

## Phase 3 — Orders and purchases actions, cost leak

Small API changes plus UI. Run the full suite at the end of this phase.

### 3.1 Transfer to the café from a purchases row _(was #16)_

- **Now:** a transfer from an invoice is only reachable through the invoice page →
  `/transfers?direct=1&invoice=id` (`app/purchases/detail/page.tsx:86-95`). The purchases list has
  only 👁 (`app/purchases/page.tsx:154-162`).
- **Goal:** a transfer icon next to 👁 opens the direct-transfer modal (`TransferFormModal`,
  direct mode, `purchaseInvoiceId`) on the purchases page itself. The list refreshes after
  saving. The icon is hidden when every line of the invoice is already fully in the café.
- **Changes:** add `hasStockToTransfer: boolean` to `PurchaseInvoiceSummary`
  (`packages/shared/src/types/purchases.ts`), computed in the purchases list query with the same rule as
  `purchases/detail/page.tsx:74-77` (some line has `stockQuantity − transferredToCafeQuantity > 0`).
- **Done when:** the icon hides after a full transfer, and the server caps still apply
  (spec §5, invoice ⇄ café link).

### 3.2 Refund status visible on orders _(was #4)_

- **Now:** returned quantities exist only behind `GET /api/refunds/order/:orderId/quantities`, and
  only the refund modal uses them (`components/refunds/refund-order-modal.tsx:48-64`). The order
  list and order page show nothing about refunds.
- **Goal:** the list status column adds a **مرتجع جزئي** / **مرتجع بالكامل** badge. The order page
  shows a "returned" column per line (e.g. `1 من 3`), the refunded amount, and links to each refund.
  The printed receipt is unchanged.
- **Changes:** `OrderSummary` gets `refundedAmount` and `refundStatus: "none" | "partial" | "full"`.
  Each order-detail line gets `refundedQuantity`, plus a `refunds` list (id, amount, createdAt).
  All of it is computed from the refund lines in the same queries, with no new tables
  (`apps/api/src/modules/orders/orders.repository.ts`, `orders.service.ts:328-350`). Check that
  `@cashier/online-api` either doesn't serve orders or stays in step with the shared type.
- **Done when:** a partially refunded order shows partial, a fully refunded order shows full, and
  repository tests cover both plus none.

### 3.3 Refund and waste actions on cashier orders _(was #15)_ — needs 2.1 and 3.2

- **Now:** refunds start only from the order page or the refunds page. There is no way to start
  waste from an order.
- **Goal:** each cashier order row, and the order page, offers **مرتجع** (opens
  `RefundOrderModal`, hidden when `refundStatus = full`) and **هالك**. **هالك** opens the waste
  modal from 2.1, preset to the café and limited to that order's products: a local line → `item`
  target, an external product line → `external_product` + size. Waste doesn't change the sale.
  The modal says that a refund marked "غير قابل للإرجاع" is already recorded as waste.
- **Rules:** the same shift rules as the refunds and waste pages (a cashier needs an open shift;
  admins don't). **Online orders are excluded** until phase 7.
- **Done when:** both actions work from the row and the page, and the waste target list contains
  only the order's products.

### 3.4 Cashiers never receive costs _(was #14)_

- **Now:** `/api/orders` and `/api/orders/:id` return `totalCost` and per-line FIFO allocations
  (unit costs) to every role. Only the screen hides them (`app/orders/page.tsx:153`,
  `orders/detail/page.tsx:176-260`).
- **Goal (spec §2 Roles):** the server never sends cost, profit or allocation costs to a cashier.
- **Changes:** strip cost fields for `role === "cashier"` in orders (list and detail), refunds,
  waste and café stock responses. Check every route a cashier can reach (`apps/api/src/app.ts`
  mounts plus each module router). Mark these fields optional in the shared types, and make the
  web pages handle their absence.
- **Done when:** API tests, logged in as a cashier, assert the fields are absent on each endpoint
  and still present for admins.

---

## Phase 4 — Prints

Rule (spec §2 "Paper size rule"): customer and drawer slips are **80mm**; documents with tables,
signatures or filed records are **A4**. 80mm uses the existing `Slip` (`components/print/print-slip.tsx`)
with `.receipt-print-root`. A4 uses `@page a4` / `.a4-print-root` (`app/globals.css:530-588`).

**Audit (now → goal):**

| Print button                                                   | Prints               | Now          | Goal                    |
| -------------------------------------------------------------- | -------------------- | ------------ | ----------------------- |
| POS (`pos/page.tsx`)                                           | sale receipt         | 80mm         | 80mm ✔ (keep)           |
| Order page / orders row                                        | sale receipt         | 80mm         | 80mm ✔ (fixed in 1.5)   |
| Online order row (`external-orders-panel.tsx:302`)             | order slip           | 80mm         | 80mm ✔ (keep)           |
| Purchase invoice (`purchases/detail/page.tsx:102`)             | invoice + item table | 80mm         | **A4** (4.1)            |
| Supplier statement (`suppliers/statement/page.tsx:75`)         | statement table      | 80mm         | **A4** (4.1)            |
| Stocktake (`stocktakes/page.tsx:271`)                          | count sheet          | 80mm         | **A4** (4.1)            |
| Recipe cost card (`components/recipes/cost-card-modal.tsx:30`) | cost table           | A4           | A4 ✔ (adopt 4.1 layout) |
| Reports (`packages/web-core/src/features/reports-page.tsx`)    | report               | A4 landscape | A4 landscape (phase 6)  |

### 4.1 Shared A4 document layout; three prints move to A4

- **Now:** there's no shared A4 layout, and the purchase invoice, supplier statement and
  stocktake sheet print on 80mm (`purchase-invoice-slip.tsx`, `supplier-statement-slip.tsx`,
  `stocktake-count-slip.tsx` all use `Slip`).
- **Goal:** `components/print/a4-document.tsx` provides a header (shop name, document title,
  facts), a table, totals and optional signature lines, with Arabic numerals, Cairo dates and RTL.
  The three documents render with it on A4 portrait. The stocktake sheet gets an empty
  "المعدود" column for handwriting. The cost card switches to the same layout.
- **Done when:** each print shows one A4 page per page of content and no 80mm output; view tests
  cover each document.

### 4.2 Shift close report (80mm) — new

- **Goal:** shows opening float, sales, refunds, shift expenses, expected cash, counted cash,
  over/short, cashier, and opened/closed times. It prints from the cashier close flow (Home/POS
  shift controls, `components/shifts/`) after closing, and from the admin shifts page per shift.
- **Data:** use the existing shift detail/totals responses. Add nothing new unless a figure is
  missing; if one is, add it to the shift detail response.
- **Done when:** an auto-closed shift prints "لم يُعدّ" for counted cash and over/short.

### 4.3 Transfer document (A4) — new

- **Goal:** shows items, quantities, units, source → café, request/approval people and times,
  notes, and signature lines (المُسلِّم / المُستلِم). It prints from the transfer detail page
  (`app/transfers/detail/page.tsx`).
- **Done when:** both a direct transfer and a request-approved transfer print correctly.

### 4.4 Salary payslip (A4) — new

- **Goal:** shows employee, month, base pay, bonuses, deductions, advances and net, with a
  signature line. It prints from the salaries tab for a paid month, using the stored payment row.
- **Done when:** the printed figures equal the stored payment exactly.

---

## Phase 5 — Business rules

API + web + shared, with spec rules already written (§4, §5, §6, §10). Run the full suite at the
end.

### 5.1 Supplier payments cover invoices, oldest first _(was #9)_

- **Now:** a payment lowers only the supplier balance and never changes an invoice. A credit
  invoice shows **آجل** forever (`app/purchases/page.tsx:86-98`, `purchases/detail/page.tsx:108-114`).
  The payment button shows on every invoice, including paid ones (`purchases/detail/page.tsx:105`).
- **Goal (spec §5):** payments are applied in date order to the opening balance first, then to the
  oldest unpaid invoice. Each invoice shows _paid at purchase_, _covered by later payments_ and
  _remaining_, and its status (مدفوعة / جزئية / آجلة) follows _remaining_. The allocation is
  **computed, not stored**, and `paidAmount` never changes. The payment button shows only while the
  supplier's balance is > 0.

  ```
  invoices 700 · 600 · 400 · 300, payment 1,000 →
  inv1 مدفوعة · inv2 جزئية (300 left) · inv3 آجلة · inv4 آجلة
  ```

- **Changes:** one pure allocation function (inputs: opening balance, invoices with
  date/id/total/paid-at-purchase, and payments; output: per-invoice covered/remaining), placed
  where both the list and detail queries use it (purchases service). Ties on the same date are
  ordered by creation time, then id. Expose `coveredAmount`, `remainingAmount` and `status` on
  `PurchaseInvoiceSummary` and the invoice detail. Update the list column titles and the badges.
- **Done when:** unit tests cover the example above, a payment larger than the total due,
  opening balance only, invoices fully paid at purchase, and same-day ordering.

### 5.2 Transfers and preparations may go below zero _(was #10)_

- **Now:** only sales pass `allowNegative: true` (`apps/api/src/modules/orders/orders.service.ts:254`).
  Transfers and preparations get "الرصيد المتاح لا يكفي" (`inventory/inventory.service.ts:223`,
  `recipes/recipes.service.ts:230`). A shortfall is costed at 0 (`inventory.service.ts:226-246`),
  and only **sale** costs are repaired when stock arrives (`inventory.repository.ts:170-230`).
- **Goal (spec §4, §6, §10):** transfers (approval and direct) and preparations may go negative.
  The shortfall is costed at the item's **last known unit cost** (its newest batch in any
  warehouse; 0 if never received). The café batch and the prepared output carry that cost. Arriving
  stock settles the shortage quantity as today, and the estimate is **not** repaired. These
  documents carry a negative-stock flag like sales, and the dashboard and stock pages show it.
  Waste still refuses a shortage, and stocktakes are unchanged.
- **Changes:** add an option to `consume` for the shortfall unit cost (default `"0.000000"`, so
  sales are unchanged), and a repository read for the last known unit cost. Transfers and
  preparations pass `allowNegative: true` and that cost. Remove the "approval refuses a shortage"
  path and its UI message. The transfer form's "available" hint warns but no longer blocks.
- **Done when:** tests cover a transfer above the balance (main goes negative, the café batch is at
  the last cost), a preparation with a missing ingredient, a never-received item (cost 0),
  settlement of the shortage by a later purchase without changing the estimated cost, and waste
  still refusing.

---

## Phase 6 — Reports redesign

`packages/web-core/src/features/reports-page.tsx` (shared by desktop and online; its per-tab table
builders live in `packages/web-core/src/features/reports/tables/*`),
`packages/web-core/src/components/reports/report-table.tsx`, `packages/web-core/src/models/reports-model.ts`,
and `packages/server-core/src/modules/reports/*`. Spec §14 "Reports page design" holds the target.
Run the full suite at the end, including `@cashier/online-web` and `@cashier/online-api`.

**Now (summary):** seven raw-table tabs with no overview, search, filters, sorting, presets or
charts. The date change needs "تحديث". Dates are raw. The header has developer text. Work time is
in minutes. There's no margin %.

### 6.1 Fix the two confirmed bugs

- **Now:** every ID column shows **"ليس رقمًا"**, because UUIDs are formatted with `kind: "number"`
  (`features/reports/tables/*`: `shiftId`, `id`, `referenceId`, `transferId`, `requestId`, `invoiceId`,
  `preparationId`, `purchaseInvoiceId`). Verified on live data. "By day" hides `returnedCost`, so a
  row doesn't add up (597 − 37.32 − 403 ≠ 168.68).
- **Goal:** ID columns show a readable reference (the document number where one exists, e.g. the
  order number or invoice number; otherwise a short code) and link to the document. "By day"
  shows **التكلفة المرتجعة**, so every row satisfies sales − refunds − cost + returned cost = profit.
- **Done when:** no cell can render "ليس رقمًا" (a test feeds UUIDs), and the by-day sum test passes.

### 6.2 Date bar: presets and auto-reload

- **Goal:** presets اليوم، أمس، هذا الأسبوع، هذا الشهر، الشهر الماضي، مخصص (custom shows the
  two date inputs). Any change reloads automatically, so the "تحديث" button and the "dates not
  applied" note go away. The period line shows Arabic dates in the right order. The developer
  text "مبيعات الأونلاين … لم تتوفر بعد" is removed. Branch, period and generated time stay on the
  printed page.
- **Done when:** each preset produces the correct Cairo range (tests at month and week edges),
  and a late response from an older range is ignored.

### 6.3 Table toolkit: search, sort, filter, totals

- **Goal:** every report table gets a search box (over text columns), sorting by clicking any
  header (asc/desc, Arabic collation, numbers numeric), filters where meaningful (warehouse,
  category, cashier, type, status), a **totals row** for money and quantity columns, and an empty
  state. Print and the online Excel export output exactly what is filtered and sorted on screen.
- **Changes:** extend `ReportTable` and `Column` (`filter?: true`, `total?: true`). Keep the
  pure helpers (sort, filter, totals) in `reports-model.ts` with unit tests.
- **Done when:** each feature has tests, and the online Excel output matches the screen.

### 6.4 Tabs restructure and readability

- **Goal:** the tabs are نظرة عامة · المبيعات · المخزون · المصروفات والأرباح · الموظفون والورديات ·
  الموردون. Waste and refunds sit under sales/stock; transfers and preparations under stock. Raw
  ledgers (stock movements, transfer lines, request lines, preparation ingredients) collapse into
  an expandable **التفاصيل** section under their summary. Work time shows in hours (e.g.
  `7 س 30 د`). Products and categories get a **هامش الربح %** column.
- **Done when:** every table from the old tabs still exists somewhere, and none is lost.

### 6.5 Overview figures (API)

- **Goal:** `GET /api/reports` adds an `overview` group for the range and for the **previous period
  of equal length**: net sales, orders, average order, gross profit, margin %, expenses, waste
  cost, salaries and advances paid, and **net profit = gross profit − expenses − waste cost −
  salaries and advances paid in the period** (owner-confirmed). It also adds sales by hour (Cairo,
  0–23), the top 5 products by sales and by profit, and alert counts (low stock, negative stock,
  over/short shift events).
- **Changes:** `reports.repository.ts` / `reports.service.ts` in the same REPEATABLE READ
  transaction (spec §14 "Dates and amounts"). Update the report types in `web-core`.
- **Done when:** service tests check every figure against seeded data, including an empty period
  and a previous period with zero (no division by zero in % change).

### 6.6 Overview tab UI and charts

- **Goal:** the overview is the default tab. It shows KPI cards with the change vs the previous
  period (↑/↓ and %), a sales-by-day bar chart, a sales-by-hour chart, two top-5 lists, and alert
  cards linking to the relevant tab/page. Charts are **inline SVG** (no new library), readable in
  RTL, and print on A4 landscape.
- **Done when:** view tests cover the KPI change rendering (up, down, no previous data), and
  printing the overview fits A4 landscape.

**After phase 6: release A** (desktop patch; it deploys online first). Correct
`apps/desktop/README.md:177` in the same release. It says "shared code" changes need no desktop
release, but `packages/shared`, `server-core`, `db` and `web-core` are bundled into the desktop.

---

## Phase 7 — Online orders take from stock (release B, database change)

Spec §7 "Online orders" holds every rule. Start only after release A is published.

**Now:** online orders are cached as summaries only (`external_orders_cache`: totals, status, item
_count_). The client receives each order's items but keeps only their quantity
(`apps/api/src/modules/orders/external-orders.client.ts:48`). Nothing takes them from stock. One
online account serves every branch and orders carry no branch, so every PC sees every order.

According to the local copy of the ordering system (`apps/temp-backend`, git-ignored, so it may
differ from the live one; `Controllers/Admin/AdminOrdersController.cs:125-157`), each item has
`ProductId`, `ProductSizeId`, `Quantity`, `UnitPrice`, `DiscountAmount`, `TotalPrice`, `Comment`,
and `Modifiers` (names Ar/En, quantity, unit price — **no option ID**). Verify against the live
API response before building 7.3. If it differs, stop and ask the owner.

### 7.1 Schema

- **Goal:** `orders` gets `source` (`pos` | `online`, default `pos`) and `external_order_id`
  (nullable int), unique per branch. The online database stores which branch fulfills online
  orders (one at most). The PC records when it became the fulfilling branch (the start point).
- **Rules:** follow `apps/desktop/README.md:201-209`: add, don't break; new columns are nullable or
  defaulted; one migration; regenerate the sync triggers (`pnpm --filter @cashier/db db:generate`).
- **Done when:** schema tests pass, and an older PC's backups are still accepted (one migration
  behind).

### 7.2 Choose the fulfilling branch online; the PC learns it

- **Goal:** the super-admin sets **الفرع المسؤول عن طلبات الأونلاين** on the online branches page
  (`online-web`, stored by `online-api`). `/device/accounts` returns `fulfillsOnlineOrders:
boolean` for the PC's branch, and the PC applies it on every pull
  (`apps/api/src/desktop/accounts.ts`). When it turns on, the PC stores the time as the start
  point. Turning it off stops new deductions only.
- **Done when:** switching the branch online changes which PC deducts after its next pull, and
  only super-admins can change it.

### 7.3 Parse order items and resolve add-ons

- **Goal:** the client keeps each order's items (product id, size id, quantity, prices, comment,
  modifiers). It accepts an optional `ModifierOptionId` for the future. A pure resolver maps each
  modifier to a cached option:

  ```
  order item ProductId 12 + add-on (nameAr, nameEn, unitPrice, quantity)
    → external_modifier_groups where external_product_id = 12
    → their external_modifier_options with the same nameAr AND nameEn
    → exactly one → its externalId ✔
    → several → keep the one whose extraPrice = unitPrice; still not one → unresolved
    → none → unresolved
    (ModifierOptionId present → use it directly)
  ```

- **Done when:** resolver tests cover a unique match, a tie broken by price, an unbreakable tie, no
  match, and a present ID.

### 7.4 Deduct on arrival, exactly once

- **Goal:** on the fulfilling PC, every order first seen **after the start point** becomes a local
  order with `source = online` and its `external_order_id`, built through the existing order
  machinery (`orders.service.ts`: external product lines, ingredient mappings, FIFO,
  `allowNegative`). It has no shift and no cashier drawer effect. The unique key makes retries,
  restarts and repeated fetches no-ops. An unresolved add-on is skipped, and the order is flagged
  **يحتاج مراجعة** with the add-on name. A product or size with no ingredient setup deducts nothing
  and is flagged for setup.
- **Done when:** tests cover a double delivery (one deduction), an order from before the start
  point (ignored), a non-fulfilling PC (no deduction), a flagged unresolved add-on, and an unmapped
  product.

### 7.5 Cancellation reverses once

- **Goal:** when a deducted order turns **cancelled**, it is fully reversed once: stock goes back to
  its batches, like a refund with "return to stock", recorded against the order. Re-seeing the
  cancelled status does nothing.
- **Done when:** tests cover cancel after deduction, a repeated cancel, and cancel before deduction
  (nothing to reverse).

### 7.6 Online orders in the UI and reports

- **Goal:** online order rows show the review/setup flags and, once recorded as sales, offer print,
  **مرتجع** and **هالك** like cashier orders (slice 3.3). Reports show an **أونلاين** channel
  separate from POS, and online sales never appear in shift figures or expected cash.
- **Done when:** the full suite is green, then **release B** goes out alone.

---

## Environment note (not part of the work)

On 2026-10-15 the owner's PC was filled with temporary test data, and uploads were blocked with
`ONLINE_API_URL=http://127.0.0.1:9/api` in `C:\ProgramData\Cashier\settings.env`. Backups are
`mysql.before-testdata` and `settings.env.before-testdata` in the same folder. Restoring them
(with Cashier closed) is a separate owner-requested step. Don't change these as part of this plan.
