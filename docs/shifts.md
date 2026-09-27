# Concurrent cashier shifts

Different cashiers can work simultaneously in the same branch or different branches. Each cashier account can have only one open shift. Each shift keeps its own cashier, employee, branch, float, transactions, cash reconciliation, worked time, and events.

## Using shifts

- Cashier: open **Home** or **POS**, choose **فتح وردية**, and enter the counted starting float. Choose **إغلاق وعدّ الدرج** on either page to enter actual cash and close the selected shift.
- **سجل وردياتي** opens the cashier's own history on either page. Previous/next pages retrieve older records, and **تفاصيل الوردية** shows totals, closing time, and audit events. Records are retained.
- Admin: the selected branch's Home dashboard and **الورديات** page show every open shift. Force-close with a note, reopen a closed shift, or correct its float/actual cash with a note. Another cashier's open shift does not block reopening; the same cashier's open shift does.
- Cashiers cannot navigate to the separate Shifts administration page. Existing cashier/admin transaction permission gaps remain AUTH-1 in the audit.

Sales, refunds, shift expenses, cafe waste, and cashier transfer requests attach to the acting cashier's own shift. Closing computes `expected = opening float + sales - refunds - shift expenses`, then stores `over/short = actual - expected`. Worked time sums open/reopened segments, excluding closed gaps.

## API

All requests use the existing authenticated branch selection.

| Request                              | Result                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `GET /api/shifts/current`            | Cashier: own open shift or `null`; admin: `null` (no personal cashier shift)                  |
| `GET /api/shifts/active`             | Admin: all open shifts in the selected branch                                                 |
| `GET /api/shifts/today`              | All shifts opened on today's Cairo calendar date; cashier: own shifts, admin: selected branch |
| `GET /api/shifts?limit=100&offset=0` | Paginated history; limit 1–100, offset nonnegative; same ownership rules                      |
| `GET /api/reports/dashboard`         | `openShifts` array containing every open shift in the selected branch                         |

The existing open/close/admin-close/reopen/correction routes and payloads remain. Duplicate open/reopen for one cashier returns 409. API ownership prevents closing another cashier's shift or administering a shift outside the selected branch.

## Migration and rollout

`0041_cashier_concurrent_shifts.sql` replaces the unique `(branch_id, open_slot)` index with `(cashier_user_id, open_slot)` in one `ALTER TABLE`. Open shifts use slot 1; closed shifts use NULL. Existing records, IDs, cash totals, and events are preserved.

Stop the old API/worker before migration, apply migrations using the existing deployment workflow, then start the updated API/web/worker together. The old application assumes a branch singleton and must not keep serving after the new index permits multiple shifts. The `/current` admin response and dashboard `openShifts` contract require the updated web client.

The migration has been applied to the guarded test database for verification. Production migration/deployment is a separate rollout step.

## Verification

HTTP/MySQL tests cover concurrent distinct cashiers, same-account races, same-branch reopening conflicts, concurrent branches, isolated lists/dashboards/admin actions, more than 100 history records, complete Home daily totals, and ownership/reconciliation for all five shift-linked transaction flows. Client tests cover direct controls, selected-shift preservation during refresh, submission/error handling, cashier route exclusion, concurrent admin views, and older-history details/navigation.
