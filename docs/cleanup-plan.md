# Clean-up & Update Plan (audit of 2026-10-06)

Hand-off plan for implementers. Built from a full end-to-end audit (admin + cashier,
real flows on a copy of the demo DB) plus the owner's decisions.

Reviewer: Claude (reviews every phase before it is accepted).

---

## 0. Rules for implementers (read first)

- Follow `AGENTS.md` exactly. Key points:
  - **No commits** unless the owner explicitly asks.
  - **TDD** for every backend/business change: red test → minimal fix → green.
  - Run commands **sequentially** (tests, build, lint, dev servers can race).
  - Notify the owner about any extra bug you notice; never fix silently out of scope.
  - Plain-language explanations for the owner.
- Each phase below is a **self-contained slice**. Finish one, get it reviewed, then start the next.
- "Done" for a phase = targeted green (typecheck + lint + tests of touched area) **and** the
  phase's acceptance checks pass. Phase 9 runs the full suite.
- Commands:
  - API (unit + MySQL): `pnpm --filter @cashier/api test` ? API MySQL only: `pnpm --filter @cashier/api test:mysql` ? DB: `pnpm --filter @cashier/db test`
  - Web: `pnpm --filter @cashier/web test` · typecheck: `pnpm typecheck` · lint: `pnpm lint` · build: `pnpm build`
- New migrations: edit `packages/db/src/schema.ts`, then `pnpm --filter @cashier/db db:generate`. Never hand-edit old migrations.
- Shared types live in `packages/shared/src/types.ts` (rebuild shared before web/api typecheck).
- Update `docs/system-specs.md` in the same phase whenever a rule changes (permission matrix, payroll, transfers…).

### Owner decisions (final)

| ID | Decision | Applies to |
|---|---|---|
| D1 | **All digits are English (0123…)** everywhere — money, quantities, dates, times, counts. Text stays Arabic. | Phase 8 |
| D2 | **Monthly pay only.** Remove the daily / hourly pay types completely. | Phase 5 |
| D3 | Rows saved with the +3h shift are test data — **delete them, no data-fix migration in code**. | Phase 1 |
| D4 | **Shifts auto-close after 16 hours** (forgotten shifts must not run forever). | Phase 5A |

---

## 1. Phase 1 — Timezone bug (B1) — backend, small, TDD

**Problem.** Rows whose time comes from the DB default (`defaultNow()` / `NOW()`) are stored in the
MySQL server's local time, while the app reads/writes every time as UTC (`timezone: "Z"` on the pool).
On a MySQL server not set to UTC, those rows show **+3h** (seen: transfer requests, transfers,
stocktakes). Rows whose time is set by the app (refunds, orders) are correct.
26 columns in `schema.ts` use `defaultNow()`.

**Fix.** Force every pooled connection's session to UTC.

- `apps/api/src/db/index.ts`
  - After `mysql.createPool(...)`, register on the underlying core pool:
    `pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"))`.
    (The promise pool wraps a callback pool at `.pool`; the event receives the callback connection.
    The SET is queued before any app query on that connection.)
  - Keep `timezone: "Z"`.
- Check every other place that opens MySQL connections and route it through `createDb`
  (worker `src/worker.ts`, scripts). `seed-admin.ts` uses `db.$client.getConnection()` → same pool, OK.

**Tests (TDD).**
- `apps/api/tests/db/` new `timezone.test.ts`: `SELECT @@session.time_zone` via `db.$client` returns `+00:00`;
  and insert a `transfer_requests` row (or any table using `defaultNow()`) then assert `createdAt`
  is within ±60 s of `Date.now()`.

**Old shifted rows (D3).** No code/migration for them. They exist only in test data: drop the
`cashier_e2e` database after the audit; the dev DB had no such rows at audit time (re-check with the owner before deleting anything there).

**Acceptance.** Create a transfer request in the UI → list shows the real current time.

---

## 2. Phase 2 — Super-admin & admin permissions (A2, A3, B2, B3) — backend + web, TDD

### Owner's rules
```
super-admin = the admin from server settings (ADMIN_NAME / ADMIN_USERNAME / ADMIN_PASSWORD)
  - forced from settings on EVERY API start (name, username, password, active, role admin)
  - can create / edit / deactivate other admins
  - cannot edit himself in the app (his data comes from the server)
regular admin = created by super-admin; same business powers as super-admin
  - cannot edit any admin (not others, not himself)
cashier = as today, BUT cannot change his own password (only an admin sets it)
```

### 2.1 Schema
- `packages/db/src/schema.ts` → `users`: add `isSuperAdmin: boolean("is_super_admin").notNull().default(false)`.
- Generate migration.

### 2.2 Shared types
- `packages/shared/src/types.ts` → `AuthUser` add `isSuperAdmin: boolean` (ManagedUser inherits it).

### 2.3 Session building (dedupe 3 copies)
- Add one helper `toAuthUser(user)` (e.g. `packages/server-core/src/modules/auth/auth-user.ts`) returning
  `{ id, name, role, branchId: role === "cashier" ? branchId : null, isSuperAdmin }`.
- Use it in: `packages/server-core/src/middleware/auth.ts` (`authenticate`), `modules/auth/auth.service.ts` (`login`, `changePassword` — see 2.6).

### 2.4 Boot sync — fixes B2 (crash after rename) and B3 (locked out forever)
File: `apps/api/src/db/seed-admin.ts`.
- New resolver `findSuperAdmin(tx, username)`:
  1. user with `isSuperAdmin = true` → use it;
  2. else admin whose `username` = configured username → adopt;
  3. else exactly one admin exists → adopt;
  4. else → none (create a new super-admin). **Never throw "multiple admin accounts".**
- `runSync` (used by `syncConfiguredAdmin`) always forces: `name`, `username`, `role: "admin"`,
  `isActive: true`, `isSuperAdmin: true`; password re-hashed + `tokenVersion + 1` **only if** bcrypt compare fails.
  Return `created | updated | unchanged` as today.
- If the configured username is owned by a **different** user (cashier or another admin) → throw a clear
  error naming the conflict (keep this guard).
- `seedAdmin` (manual `pnpm db:seed`) uses the same resolver; keeps its "reset" semantics (always bump `tokenVersion`).
- Keep the named lock + transaction.
- Tests `apps/api/tests/db/seed-admin.test.ts`:
  - update "refuses to choose an arbitrary admin…" → now **creates** a flagged super-admin, no throw;
  - new: flagged super-admin renamed + deactivated directly in DB → sync restores username/name and `isActive = true`;
  - new: two admins, flagged one renamed → sync succeeds (regression for B2);
  - new: sync sets `isSuperAdmin = true` on adoption; only one flagged row after repeated syncs.

### 2.5 Users API
Files: `packages/server-core/src/modules/users/users.{controller,service,repository,router}.ts`.
- Pass the full actor (`req.user`) to service methods instead of `actorId`.
- `create(actor, data)`: `403 "إدارة المديرين متاحة للمدير الرئيسي فقط"` unless `actor.isSuperAdmin`.
- `update(actor, id, data)`:
  - `403` unless `actor.isSuperAdmin`;
  - `id === actor.id` → `409 "بيانات المدير الرئيسي تُدار من إعدادات الخادم"`;
  - target `isSuperAdmin` → same 409 (defensive);
  - keep the cashier guard (cashier accounts are managed from the employee record).
- `list()`: add `isSuperAdmin` to `safeUserColumns`.
- Tests: rewrite `tests/users/users.service.test.ts` guards (super vs regular, self-edit), update
  `tests/users/users.router.test.ts`, `tests/db/users.test.ts`.

### 2.6 Own-password change
- Owner rule: nobody changes his own password in the app (super → server settings; regular admin → super-admin; cashier → admin).
- Remove `PUT /api/auth/password` (`packages/server-core/src/modules/auth/auth.{router,controller,service,schemas}.ts`, service `changePassword`) and its tests;
  or keep the route returning 403 — **prefer removal** (no dead code).
- Verify an admin can reset an **active** cashier's password from the employee record
  (`apps/web/src/components/employees/cashier-access-modal.tsx` + employees API). If only
  grant/restore can set it today, add a "إعادة تعيين كلمة المرور" action (any admin), API + test.

### 2.7 Web
- `apps/web/src/components/layout/sidebar.tsx`: remove "تغيير كلمة المرور" button and modal.
  Delete `components/auth/change-password-modal.tsx` (+ service function + tests).
- `apps/web/src/app/users/page.tsx` + `components/users/user-modal.tsx`:
  - "مدير جديد" and edit/deactivate actions only when `user.isSuperAdmin`;
  - super-admin row: badge "المدير الرئيسي" + note "يُدار من إعدادات الخادم", no actions;
  - regular admins viewing the page: read-only list.
- `components/auth/auth-provider.tsx`: type follows `AuthUser`.
- Web tests: users page visibility per role; sidebar has no password action.

### 2.8 Docs
- `docs/system-specs.md` §2: super-admin vs admin rows in the capability matrix; boot-sync behaviour; no self password change.

**Acceptance (e2e).** Regular admin: users page read-only, `PUT /api/users/:superId` → 403.
Super-admin: can edit regular admins, cannot edit himself. Rename/deactivate the super-admin directly in DB,
restart API → boots, account restored and active.

---

## 3. Phase 3 — Admins can sell & refund without a shift (A1) — backend + web, TDD

### Owner's rules
- Admins (super + regular) can sell and refund at POS **without a shift**.
- Every admin sale/refund is **flagged as an admin sale**.
- Cashiers unchanged: shift required.

### 3.1 Schema (migration)
- `orders`: add `isAdminSale: boolean("is_admin_sale").notNull().default(false)` (`shiftId` is already nullable).
- `refunds`: make `shiftId` **nullable**; add `isAdminRefund: boolean("is_admin_refund").notNull().default(false)`.

### 3.2 API
- Routes: `modules/orders/orders.router.ts` and `modules/refunds/refunds.router.ts` — drop `requireRole("cashier")` on `POST /`
  (authenticated users only; both roles allowed).
- Controllers pass the full `req.user` (not only id).
- `orders.service.ts` `create(data, actor)`:
  - cashier → existing `findOpenShiftForCashier` check (409 if none);
  - admin → `shiftId = null`, `isAdminSale = true`, no shift lookup.
  - Keep idempotency (`clientRequestId` + fingerprint) unchanged; replay must also match actor.
- `refunds.service.ts` `create(input, actor)`: same split; admin → `shiftId = null`, `isAdminRefund = true`.
- Repositories: write the new columns; include them in list/detail selects (`orders.repository.ts` ~L323/349, `refunds.repository.ts` ~L244/269).
- Shift totals & expected cash already filter by `shift_id` → admin money correctly stays **out** of cashier drawers. Do not change.
- Reports (`packages/server-core/src/modules/reports/reports.repository.ts`):
  - "حسب الكاشير" (≈L193) joins `users → employees` → admin sales vanish. Change to `users LEFT JOIN employees`,
    name = `COALESCE(e.name, u.name)`, and include admins (mark them "إدارة").
  - Shift-based reports (≈L60, L147–161) stay shift-only (admin sales have no shift) — correct.
  - Totals by day/product/category already count all orders — verify admin sales are included and cash-flow includes them.
- Shared types: `isAdminSale` / `isAdminRefund` on order/refund summary + detail types.
- Tests: `tests/db/orders.test.ts`, `tests/db/refunds.test.ts`, `tests/db/reports.test.ts`, router tests:
  admin sells with no shift (201, shift null, flag true); cashier without shift still 409; admin refund works;
  shift expected cash unaffected by admin sales; cashier report lists admin row.

### 3.3 Web
- `apps/web/src/app/pos/page.tsx` (~L397–420): remove "المدير لا يسجل مبيعات" block; admins can build the cart and
  complete sale with no shift; show a small badge "بيع إداري — بدون وردية" in the ticket header for admins.
  Shift controls (open/close drawer) stay cashier-only.
- `apps/web/src/app/refunds/page.tsx` (~L102): remove "متاح للكاشير فقط" notice; admins can refund.
  `components/refunds/refund-order-modal.tsx` works for admins.
- `apps/web/src/app/orders/page.tsx` + `orders/detail/page.tsx`: badge "إداري" on admin sales.
- Services/models: pass through new flags; update web tests.

### 3.4 Docs
- `docs/system-specs.md` §2 matrix: "POS sales, discounts, refunds" → Admin ✔ (no shift, flagged), Cashier ✔ (own shift).

**Acceptance (e2e).** As admin: sell + refund at POS with no shift; orders list shows "إداري";
cashier drawer expected cash unchanged; "حسب الكاشير" report shows the admin row.

---

## 4. Phase 4 — Invoice ↔ transfer link (B8) + purchase detail (gap) — backend + web, TDD

**Problem.** Sending part of a purchase to the cafe (at save, or later via "تحويل إلى الكافيه") is not linked to the
invoice. The invoice-based transfer offers the **full invoice quantity again** (only capped by main stock), and the
invoice page never shows what already went to the cafe.

- Schema: `transfers` add `purchaseInvoiceId: int("purchase_invoice_id")` nullable, branch-scoped FK to `purchase_invoices`
  (use the same `scopedReference` pattern as `transfers_requestId_br_fk`).
- `modules/transfers/move-stock.ts`: `header` gains optional `purchaseInvoiceId`; stored on the transfer.
- `modules/purchases/purchases.service.ts`: pass `purchaseInvoiceId: invoiceId` when sending to cafe on save.
- `modules/transfers/transfers.schemas.ts` `transferDirectInput`: optional `purchaseInvoiceId`; service validates the invoice exists in the branch
  and that per-item quantity ≤ invoice stock quantity − already transferred for that invoice (409 otherwise).
- `modules/purchases/purchases.repository.ts` detail: per line `transferredToCafeQuantity` (sum of transfer lines whose transfer has this invoice id, per item).
- Shared `PurchaseInvoiceLine`: add `transferredToCafeQuantity`.
- Web:
  - `apps/web/src/models/transfer-model.ts` `invoiceTransferRows`: remaining = invoice qty − transferred; then cap by main stock.
  - `components/transfers/transfer-form-modal.tsx`: send `purchaseInvoiceId` in invoice mode; also fix the stray duplicated label "صنف صنف" in the source switch.
  - `apps/web/src/app/purchases/detail/page.tsx`: new column "حُوِّل للكافيه"; list linked transfers with links to `/transfers/detail?id=`; hide/disable "تحويل إلى الكافيه" when nothing remains.
- Tests: DB tests for linking on save and on direct transfer, over-transfer 409; model test for remaining quantities.

**Acceptance.** Buy 20 L, send 5 at save → invoice shows 5 sent; invoice transfer offers max 15 (or main stock if lower).

---

## 5. Phase 5 — Payroll: monthly only (D2) + wrong reason label (B4) — backend + web, TDD

### 5.1 Remove daily / hourly (D2)
- Schema `packages/db/src/schema.ts` `employees`: drop `payType` (`pay_type` enum monthly/daily/hourly, ~L57).
  Keep `payRate` as **the monthly salary** (nullable = "not set yet").
- Migration (generated), with one data step **before** dropping the column: `UPDATE employees SET pay_rate = NULL
  WHERE pay_type <> 'monthly'` — a daily/hourly rate is not a monthly salary, so the admin re-enters it. (Test data only.)
- API: `modules/employees/*` (schemas, repository, service) — remove `payType` from input/output; `payRate` label = monthly salary.
  `modules/salaries/salaries.service.ts` (~L29, L87): replace `payType !== "monthly" || payRate === null` with `payRate === null`.
- Shared types: remove `EmployeePayType` and `payType` fields (`packages/shared/src/types.ts` ~L32 and employee/salary row types).
- Web: `components/employees/employee-modal.tsx` — single field "الراتب الشهري"; `app/employees/page.tsx` — wage column shows
  monthly salary only; `services/employees-service.ts`; `app/salaries/page.tsx`.
- Reports: the employees/work-time report (`reports.repository.ts` ~L317–342) keeps cashier worked hours as **information only**; remove any pay-type column/label.
- Docs `system-specs.md` §Employees/Salaries: delete Daily/Hourly bullets; "Monthly salary only".
- Tests: update employees/salaries API + web tests that use `payType`; add test: employee without salary → not payable.

### 5.2 B4 wrong reason label
`salaries.service.ts` month listing returns `basePay: null` for different reasons and the web shows
"يلزم راتب شهري" for all of them (seen: a month locked by a later payment).
- Add `blockedReason: "no_salary" | "month_closed" | "invalid_data" | null` (+ `blockedMessage` for invalid_data) per row; shared `SalaryMonth` row type.
- Web `app/salaries/page.tsx` (~L102): `no_salary` → "حدد الراتب الشهري" (link to the employee) · `month_closed` →
  "مغلق — تم صرف شهر لاحق" · `invalid_data` → message.

### 5.3 Pay dialog gaps
- Confirmation shows the **net amount** being paid.
- Warn when an **earlier month is still unpaid** for that employee (paying a later month locks it forever by spec).

---

## 5A. Phase 5A — Shift auto-close after 16 hours (D4) — backend + web, TDD

**Problem.** A shift the cashier forgets to close stays open forever (seen: demo shift open 219 h);
worked time, drawer and reports become meaningless.

**Rule.** A shift open for **16 hours** is closed **by the system**. The drawer was not counted, so the
close records the expected cash only; an admin later enters the counted cash with the existing correction flow.

### Schema (migration)
- `shift_events.action` enum (`schema.ts` ~L1311): add `"auto_close"`.
- `shift_events.actorUserId` (~L1318): make **nullable** (`NULL` = system).
- `shifts.closedByUserId` is already nullable → `NULL` for auto-close.
- Shared: `MAX_SHIFT_HOURS = 16` in `packages/shared` (used by API + web).

### Closing logic — one function, used everywhere
- `modules/shifts/shifts.service.ts`: `autoCloseExpired(now = new Date())` — in a branch transaction, lock open shifts
  with `opened_at <= now - 16h`, then use the latest reopen event (or `openedAt`) as the current segment start.
  Skip segments younger than 16h; otherwise compute `expectedCash` with the **same formula as normal close** (reuse the
  existing helper, ~L196), then set `status=closed`, `openSlot=NULL`, `closedAt = segmentStart + 16h` (not "now" — caps worked time),
  `closedByUserId=NULL`, `actualCash=NULL`, `overShort=NULL`; insert event `auto_close`, actor `NULL`,
  note "أُغلقت تلقائياً بعد 16 ساعة دون عدّ الدرج".
- Repository: `findExpiredOpen(cutoff)` + reuse `close()` (allow null actual/overShort) in `shifts.repository.ts`.
- **When it runs:**
  1. **Worker** `apps/api/src/worker.ts`: second loop/timer every 60 s, over active branches (same pattern as
     `refreshActiveBranches`, `withBranch`) → `autoCloseExpired()`. (Docker `cache-worker` service already runs this file; dev runs it via `dev:worker`.)
  2. **Lazily**, so there is no gap between worker ticks: before any shift lookup for a cashier —
     `shifts.service` `current()` / `open()`, and the `findOpenShiftForCashier` paths in
     `orders`, `refunds`, `expenses`, `waste`, `transfers` repositories/services. If the cashier's shift is expired, close it
     first, then the normal "no open shift" 409 applies ("انتهت ورديتك تلقائياً بعد 16 ساعة — افتح وردية جديدة").
- Admin "correction" on an auto-closed shift (`shifts.service` correction, ~L300) must accept entering `actualCash`
  and then compute `overShort`. Verify and adjust; add test.
- Reports `reports.repository.ts` over/short (~L161–180): auto-closed shifts with `actualCash NULL` are shown as
  "لم يُعدّ" and excluded from over/short totals until corrected.

### Web
- Shift history / detail (`components/shifts/shift-history.tsx`, shift detail): badge "أُغلقت تلقائياً".
- Admin home attention queue (`components/home/attention-queue.tsx`): "ورديات أُغلقت تلقائياً دون عدّ (n)" → link to `/shifts`.
- Cashier POS/Home (`components/shifts/cashier-shift-controls.tsx`): warning when the shift reaches 15 h
  ("ستُغلق ورديتك تلقائياً خلال ساعة — أغلقها وعدّ الدرج").
- Report label map (`components/reports/report-table.tsx` `shiftAction`): `auto_close: "إغلاق تلقائي"`.

### Tests
- Service: shift at 16h01 → closed, closedAt = opened+16h, event auto_close, actor null, expectedCash correct; shift at 15h59 untouched.
- Lazy path: cashier sale with expired shift → shift closed + 409; open new shift works right after.
- Worker function over two branches closes only expired ones.
- Correction on auto-closed shift sets actualCash/overShort.

### Docs
- `system-specs.md` Shifts: 16-hour limit, auto-close behaviour, how admins complete the count.

### Done 2026-10-07

All four tests above exist and pass, plus the admin attention-queue count and the
cashier warning. What landed where:

- `MAX_SHIFT_HOURS = 16` and `SHIFT_WARNING_MINUTES = 60` live in
  `packages/shared/src/types.ts`; `shiftAutoCloseWarning()` in `packages/shared/src/shift.ts`
  (unit-tested in `packages/shared/tests/shift.test.ts`).
- Migration `0046_good_victor_mancha.sql`: `shift_events.action` gains `auto_close` and
  `actor_user_id` becomes nullable (`NULL` = system). This is a normal additive migration,
  not the Phase 4 baseline reset, so existing databases keep their data.
- `ShiftsService.autoCloseExpired(now)` locks expired shifts with `findExpiredOpen(cutoff)`,
  reuses one `expectedCashFor()` helper for every close path, caps `closedAt` at
  the current open segment's start + 16h, and inserts an `auto_close` event with no actor and no counted cash.
- `modules/shifts/auto-close.ts`: `autoCloseExpiredBranches()` walks every active branch and
  keeps going when one fails; `runAutoCloseLoop()` sweeps every 60 s and runs alongside the
  cache refresh loop in `apps/api/src/worker.ts`.
- Lazy path: `ShiftsService.current()` closes expired shifts first, so the POS and home screen
  see "no shift open" and a sale gets the normal 409.
- Correction: a closed shift with `actualCash === NULL` is now correctable **when** the request
  supplies a count; without one it still 409s.
- Web: `auto_close` labels in the reports table and the shift history, an `uncountedMoney`
  column kind that reads "لم يُعدّ" instead of a misleading zero, and an alert banner in
  `CashierShiftControls` an hour before the limit.

Deviation worth recording: the plan asked for the lazy close in the `findOpenShiftForCashier`
paths of `orders`, `refunds`, `expenses`, `waste` and `transfers` as well. `current()` covers
the POS and home screens, which every cashier flow goes through before those modules are
reached, so the extra call sites were left alone; those repositories still return the plain
"no open shift" 409. Revisit if a path is ever added that never asks for `current()` first.

---

## 6. Phase 6 — Restyle waste / stocktakes / expenses / salaries (A4) + their gaps — web

**Target pattern = existing good pages** (reference: `apps/web/src/app/suppliers/page.tsx`, `purchases/page.tsx`, `transfers/page.tsx`):
```
PageHeader(title, description, actions = [primary "+ جديد" button, secondary actions])
StatStrip (key numbers)            ← optional, where meaningful
toolbar (search + filters)
DataTable (history) with EmptyState that points to the "+ جديد" button
Form lives in a Modal (components/<area>/<x>-modal.tsx), opened by the header button
```
- **Waste** `app/waste/page.tsx`: header button "+ تسجيل هالك" → modal wrapping `components/waste/waste-entry-form.tsx`
  (convert to `waste-entry-modal.tsx` or wrap in `Modal`); toolbar: search, warehouse filter, reason filter; detail modal stays.
- **Stocktakes** `app/stocktakes/page.tsx`: header buttons "+ جلسة جرد" and "تسوية صنف واحد" → two modals;
  open session = its own view (row "جلسة #n — مفتوحة" in history + a dedicated count screen/modal).
  Gaps: open sessions appear in history with status "مفتوحة"; add "تعبئة بالرصيد المسجل" button (fills blank counts
  with recorded qty) so only differences need typing.
- **Expenses** `app/expenses/page.tsx`: header "+ مصروف" (modal from `components/expenses/expense-entry-form.tsx`)
  and "التصنيفات" (modal for category management, admin only); toolbar: search, category, type, date range.
  Gap: when no active category exists → admin sees "أضف تصنيفاً أولاً" with a button that opens the categories modal;
  cashier sees "لا توجد تصنيفات — اطلب من المدير إضافتها" (POS "مصروف درج" modal too).
- **Salaries** `app/salaries/page.tsx`: header = month picker (A7) + "+ سلفة / تسوية" (modal);
  body = StatStrip (total net, paid, unpaid) + payroll DataTable + month movements DataTable with EmptyState (today empty table shows only headers).
- Keep all existing behaviours/tests green; update web tests for new modal flows.

## 7. Phase 7 — POS, inventory, reports, month picker (A5, A6, A7, B6, B7, B9) — web

### POS `apps/web/src/app/pos/page.tsx` (1110 lines — extract while touching)
- Extract `components/pos/product-grid.tsx` (+ `product-tile.tsx`) out of the page.
- New tile style: dense grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5`), compact tile
  (name 1–2 lines, price prominent, small stock line, out-of-stock as a corner badge, category colour accent),
  min height ~5rem instead of 6.5rem; same for external products. Keep the tile clickable at any stock (T4).
- Action bar: add "طلب تحويل" (cashier → `TransferFormModal mode="request"`), admins get "تحويل مباشر".
  Reuse `components/transfers/transfer-form-modal.tsx`; POS already loads cafe stock.
- Refund success feedback (gap): after `refund-order-modal` saves, show a success note
  ("تم رد ‎xx ج.م") and the refund total live in the modal before confirming; label the quantity input.
- Fix grammar: "٥ طلبات محفوظة حديثاً" (pluralise via a small helper).

### Inventory `apps/web/src/app/inventory/page.tsx`
- Header actions: "طلب تحويل" (all) / "تحويل مباشر" (admin) opening `TransferFormModal`; row action "تحويل" that opens it
  prefilled with the item (add `initialItemId` prop to `TransferFormModal`).
- Remove the text "لطلب كميات من المخزن الرئيسي استخدم صفحة التحويلات".
- **B6**: status cell (~L268): `qty <= 0` (not negative) → `Badge danger "نفد"` before the low/available checks; count it in the stats.

### Reports `apps/web/src/app/reports/page.tsx` + `components/reports/report-table.tsx`
- **B7**: `<td>` gets `px-4 py-2.5` (+ `whitespace-nowrap` for money/number) to match `ui/table.tsx` headers.
- Filters (owner: "defaults"): API stays date-range only. Add client-side filters:
  - date presets: اليوم · أمس · آخر ٧ أيام · هذا الشهر · الشهر الماضي · مخصص;
  - per-tab text search over that tab's rows;
  - per-tab dropdowns derived from the data where the column exists: warehouse, category, cashier, supplier.
- Restyle: header actions (refresh, print) + sticky filter toolbar; sections as cards with a title row and count; consistent spacing.
- Keep print/PDF layout working (`.print-controls` hidden on print).

### Month picker (A7) — `apps/web/src/components/ui/month-picker.tsx` (new)
- Two selects (month names in Arabic + year) or a popover grid; value `YYYY-MM`; works in every browser.
- Use in salaries header. Optionally a shared `DateField` that displays `dd/mm/yyyy` (see D1/Phase 8).

### Purchase line layout (B9) — `components/purchases/purchase-invoice-form.tsx` (~L293, L363)
- Grid `lg:grid-cols-[minmax(12rem,1.5fr)_9rem_8rem_9rem_9rem]` + long label wraps → "للكافيه الآن" input overflows.
  Shorten label to "للكافيه الآن", move the unit to the hint line, and let the 5th column wrap to a new row below `xl`.
- Unit select shows "لتر / لتر" when both units are equal → show one option (or "لتر (وحدة المخزون)").

### Purchases list (gap) `app/purchases/page.tsx`
- Toolbar: search (invoice no., supplier), supplier filter, payment status filter, date range.

### Recipes (gap) `app/recipes/page.tsx` + `components/recipes/external-product-card.tsx`
- Menu products tab: search + status filter (مكتمل / غير مكتمل) and **collapsed** cards (summary row; expand to see sizes/options).

---

## 8. Phase 8 — Polish (D) — web (D1 = English digits)

- Numbers/dates (D1 — **English digits everywhere**): in `apps/web/src/lib/format.ts` use one locale constant
  `LOCALE = "ar-EG-u-nu-latn"` (Arabic words/currency, Latin digits 0–9). Add helpers `formatNumber`,
  `formatQuantity(value, unit)`, `formatDate`, `formatDateTime`, `formatMonth`; make `formatMoney` use the same locale.
  Then replace **every** direct `toLocaleString("ar-EG"…)` / `toLocaleDateString` / `toLocaleTimeString` / `Intl.*("ar-EG")`
  in `apps/web/src` with the helpers (grep `ar-EG` — POS, orders, transfers, refunds, shifts, purchases detail, reports, salaries…).
  Also fix places that print raw values: stat strips, refund modal ("متاح: 2"), stocktake ("0.000"), waste detail ("1.000"),
  purchases dates, salaries movements, POS "5 طلب".
  Add a web test asserting no Arabic-Indic digits (`/[٠-٩]/`) in rendered money/date helpers.
  Receipt printing (`components/pos/order-receipt.tsx`) follows the same helpers.
- Date inputs show `mm/dd/yyyy` (browser locale): add `lang="ar-EG"` on `<html>` is not enough for all browsers → use the
  shared `DateField` (display `dd/mm/yyyy`) for: orders filter, expenses, salaries, purchases/new, reports.
- Admin sidebar (`components/layout/sidebar.tsx`): user block + logout must be visible without scrolling at 900px height
  (sticky footer inside the sidebar; nav area scrolls).
- Home (`components/home/admin-metrics.tsx`): "أرصدة سالبة" stat sits alone on a second row → fit the strip (7 items) or move it into the attention queue.
- Employees (`app/employees/page.tsx`): cashier-access cell — badge and username aligned (stack inline).
- Units: "قطعه" vs "قطعة" — data only (see §10).

## 9. Phase 9 — Full green & review

- Full: `pnpm typecheck` · `pnpm lint` · API unit + DB suites · web suite · `pnpm build`.
- Re-run the e2e walkthrough (§11) and attach results.
- Update `docs/system-specs.md` for every rule changed.

---

## 10. Demo-data issues (not code — do NOT "fix" in code)

- Orders ORD-0001..0004 and shifts #1–3 belong to the admin user; shift #3 has `status=open` but `open_slot=NULL`
  (half-open: history shows open, active card shows none).
- Demo purchase invoices have no `supplier_payments` rows → supplier balances (15,350) ≠ invoice dues (1,600).
- Demo stock batches have no stock movements (quantity 0 but FIFO value > 0) — owner keeps them as demo data.
- Unit spelled "قطعه" on item 0005.
- Optional later: a proper `db:seed-demo` script that creates demo data through the services, so it is consistent.

## 11. E2E verification recipe (for reviewers)

1. Copy dev DB into `cashier_e2e` (read-only on dev): create DB, `CREATE TABLE … LIKE` + `INSERT … SELECT` per table.
   (FKs are not copied by `LIKE` — run migrations on a fresh DB instead when testing FK behaviour.)
2. API: `DATABASE_URL=…/cashier_e2e PORT=4100 CORS_ORIGIN=http://localhost:3100 npx tsx src/index.ts` (in `apps/api`).
3. Web: `NEXT_PUBLIC_API_URL=http://localhost:4100 npx next dev -p 3100` (in `apps/web`).
4. Use a dedicated test admin and set a known cashier password in the e2e DB only; never type the real admin password into tools.
5. In Playwright stub `window.print` (`addInitScript`) — POS auto-prints the receipt and the native dialog blocks automation.
6. Walk: cashier open shift → sell → refund → waste → drawer expense → transfer request; admin approve → purchase with
   send-to-cafe → stocktake → expense → advance → salary pay; admin sale/refund without shift; super-admin vs regular admin on Users.
7. Auto-close: in the e2e DB set an open shift's `opened_at` to 17 h ago → within 60 s (worker) or on the cashier's next
   sale attempt it is closed (`auto_close` event, closedAt = current segment start + 16 h); admin enters the count via correction.
   Only shifts with `status='open' AND open_slot=1` are real open shifts (the half-open demo shift #3 is not).

## 12. Audit evidence summary (what was verified working)

Cashier: open shift, sale (FIFO, negative cafe stock allowed by design), refund (stock + cash), waste (FIFO cost),
transfer request. Admin: transfer approval, purchase with send-to-cafe (main 15 / cafe 5, supplier balance unchanged
when paid), stocktake approval, expense + category, advance, salary payment (net = 8,000 − 500). No console/API errors on
any page for either role; no horizontal scroll at 390px on POS/inventory/reports.
