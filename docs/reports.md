# Reports

The Reports page is admin-only and reads the selected branch. It provides basic reports for the currently implemented operations. Online revenue/stock processing and transaction edit/delete history remain separate unfinished features; the page identifies that limitation and does not include cached online summaries in POS sales or cash flow.

## Coverage

| Group                     | Contents                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sales and gross profit    | Cairo-day totals, products, categories, period shift sales, cashiers; net sales, net sales cost and gross-profit summary                                                       |
| Stock and movement        | Current quantities/FIFO value, low/negative stock, dated movements with document references, stocktake status and differences                                                  |
| Money and expenses        | Cash flow, expense categories and entries with staff/shift/note, dated shift close/correction cash snapshots                                                                   |
| Employees                 | Worked minutes and shifts with work during the period, recorded actions, whole-shift reconciliation, shift event history, salary payments/advances/bonuses/deductions          |
| Waste and refunds         | Details and summaries by target/product, staff, reason and warehouse where applicable                                                                                          |
| Suppliers                 | Current balances, dated purchase invoices and ingredient quantities/costs, supplier payments with linked invoice IDs; existing full statements remain on the Suppliers page    |
| Transfers and preparation | Executed main-to-cafe transfers and item quantities/carried FIFO costs; requests and their current review status; recipe preparations and consumed ingredient quantities/costs |

## Dates and amounts

- `from` and `to` are inclusive Cairo calendar dates. Timestamp queries use `[first instant of from, first instant of day after to)`, including days that skip midnight at daylight-saving start.
- Transaction timestamps are UTC in storage/API and displayed in Cairo. Expense dates, purchase/payment dates, and salary advance/adjustment dates stay calendar dates; no invented time is printed.
- All report sections use one read-only REPEATABLE READ transaction. The first read establishes the consistent snapshot, so concurrent writes cannot cause sections to describe different database states.
- `range` includes `from`, `to`, `branchId`, and `generatedAt`. Editing the date controls does not rename already loaded figures. Refresh clears the old report; failed/pending refreshes cannot be printed. Obsolete request responses are ignored.
- Stock quantities/value/alerts and supplier balances are **current snapshots at report generation**, independent of the selected period. They are not historical closing balances. Transfer-request status and stocktake counts/status also describe their current state; their period selection uses creation date.
- Gross profit is `sales - refunds - sales cost + returned cost`. Expenses, salaries and waste are not deducted from that figure. A discount is already included in the stored final sale total; it is not subtracted a second time.
- Sales-by-shift counts only orders/refunds timestamped within the selected period, including shifts opened earlier and reopened shifts. The employee group separately shows lifetime shift sales/refunds/expenses and stored latest cash reconciliation.
- Shift over/short lists close/admin-close/correction events **dated within the period**. Each row is the whole-shift reconciliation snapshot at that event. Repeated closures/corrections are history, not additive cash transactions; do not sum snapshots for the same shift as a new gain/loss.
- A closed gap between shift segments contributes neither worked minutes nor a worked-shift count. Sub-minute segments sum before rounding down to whole minutes.

## Print / Save as PDF

Select a report group, load its dates, then choose **طباعة / PDF** and use the browser's Save as PDF destination. This is the owner's accepted export method; there is no separate PDF download service. Printed output carries the branch, loaded date range, Cairo timezone, generation time, scope notes and the selected group's tables. Print-preview layout was not visually verified in this environment because no browser was connected.

## API and rollout

`GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` retains the existing groups and adds:

- `operations`: `transfers`, `transferLines`, `requests`, `requestLines`, `preparations`, `ingredients`.
- `money.expenses`, `employees.shiftHistory`, `suppliers.purchaseLines`.
- `sales.byShift` period figures plus `lifetimeSales`, `lifetimeRefunds`, `lifetimeExpenses` and latest reconciliation fields.
- `money.shiftOverShort` now contains dated event snapshots rather than opening-date-filtered shift records.

Deploy the matching API and web versions together. No schema migration is introduced by this reports change. The shared database pool now uses UTC for raw-query date parameters/results to match Drizzle timestamp serialization; application host timezone must not change report boundaries.

Regression coverage includes HTTP/MySQL branch isolation, period boundaries, concurrent snapshot consistency, overnight/reopened and refund-only shifts, closed-gap work counts, transfer/preparation/purchase/expense details, and component tests for date editing, refresh failure/success, obsolete responses, scope labels, Arabic codes, and Cairo date rendering.

Verified 2026-09-27: full repository tests passed (429 API unit, 223 HTTP/MySQL, 251 web). The subsequent page-default date fix passed the report component suite including its new regression (24 component tests). Repository-wide lint, type checks and production builds passed after that final fix. Formatting and Git diff checks passed. No production deployment or browser print-preview verification was performed.

CodeRabbit reviewed all 16 uncommitted files and returned one minor finding. The Reports page now gates displayed data by the current branch ID, in addition to the workspace provider's existing remount and stale-request protection. A regression test verifies that changing branch context hides the previous branch's range and figures and blocks printing. All 27 report-focused web tests passed; web lint, type checks and the production build were checked for this fix.
