import {
  mysqlTable,
  varchar,
  int,
  decimal,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { employees, users } from "./org.js";

export const shifts = mysqlTable(
  "shifts",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    cashierUserId: uuidColumn("cashier_user_id")
      .notNull()
      .references(() => users.id),
    employeeId: uuidColumn("employee_id")
      .notNull()
      .references(() => employees.id),
    status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
    openSlot: int("open_slot"),
    openingFloat: decimal("opening_float", {
      precision: 12,
      scale: 2,
    }).notNull(),
    openedAt: timestamp("opened_at").notNull(),
    closedAt: timestamp("closed_at"),
    closedByUserId: uuidColumn("closed_by_user_id").references(() => users.id),
    actualCash: decimal("actual_cash", { precision: 12, scale: 2 }),
    expectedCash: decimal("expected_cash", { precision: 12, scale: 2 }),
    overShort: decimal("over_short", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shifts_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "shifts_employeeId_br_fk",
      table.branchId,
      table.employeeId,
      (): AnyMySqlColumn => employees.branchId,
      (): AnyMySqlColumn => employees.id,
    ),
    uniqueIndex("shifts_open_slot_uidx").on(table.branchId, table.openSlot),
    index("shifts_cashier_opened_idx").on(table.cashierUserId, table.openedAt),
    index("shifts_employee_opened_idx").on(table.employeeId, table.openedAt),
  ],
);

export const shiftEvents = mysqlTable(
  "shift_events",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    shiftId: uuidColumn("shift_id")
      .notNull()
      .references(() => shifts.id),
    action: mysqlEnum("action", [
      "open",
      "close",
      "admin_close",
      "auto_close",
      "reopen",
      "correction",
    ]).notNull(),
    // NULL means the system acted: an auto_close has no human actor.
    actorUserId: uuidColumn("actor_user_id").references(() => users.id),
    note: varchar("note", { length: 500 }),
    openingFloat: decimal("opening_float", { precision: 12, scale: 2 }),
    actualCash: decimal("actual_cash", { precision: 12, scale: 2 }),
    expectedCash: decimal("expected_cash", { precision: 12, scale: 2 }),
    overShort: decimal("over_short", { precision: 12, scale: 2 }),
    occurredAt: timestamp("occurred_at").notNull(),
  },
  (table) => [
    uniqueIndex("shift_events_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "shift_events_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    index("shift_events_shift_occurred_idx").on(
      table.shiftId,
      table.occurredAt,
    ),
  ],
);
