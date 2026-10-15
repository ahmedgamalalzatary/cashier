import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
  date,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { employees, users } from "./org.js";

export const salaryAdvances = mysqlTable(
  "salary_advances",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    employeeId: uuidColumn("employee_id")
      .notNull()
      .references(() => employees.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: uuidColumn("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_advances_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "salary_advances_employeeId_br_fk",
      table.branchId,
      table.employeeId,
      (): AnyMySqlColumn => employees.branchId,
      (): AnyMySqlColumn => employees.id,
    ),
    index("salary_advances_employee_date_idx").on(
      table.employeeId,
      table.entryDate,
    ),
    check("salary_advances_amount_positive_chk", sql`${table.amount} > 0`),
  ],
);

export const salaryAdjustments = mysqlTable(
  "salary_adjustments",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    employeeId: uuidColumn("employee_id")
      .notNull()
      .references(() => employees.id),
    type: mysqlEnum("type", ["bonus", "deduction"]).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: uuidColumn("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_adjustments_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "salary_adjustments_employeeId_br_fk",
      table.branchId,
      table.employeeId,
      (): AnyMySqlColumn => employees.branchId,
      (): AnyMySqlColumn => employees.id,
    ),
    index("salary_adjustments_employee_date_idx").on(
      table.employeeId,
      table.entryDate,
    ),
    check("salary_adjustments_amount_positive_chk", sql`${table.amount} > 0`),
  ],
);

export const salaryPayments = mysqlTable(
  "salary_payments",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    employeeId: uuidColumn("employee_id")
      .notNull()
      .references(() => employees.id),
    periodMonth: date("period_month", { mode: "string" }).notNull(),
    basePay: decimal("base_pay", { precision: 12, scale: 2 }).notNull(),
    bonuses: decimal("bonuses", { precision: 12, scale: 2 }).notNull(),
    deductions: decimal("deductions", { precision: 12, scale: 2 }).notNull(),
    advances: decimal("advances", { precision: 12, scale: 2 }).notNull(),
    netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull(),
    paidBy: uuidColumn("paid_by")
      .notNull()
      .references(() => users.id),
    paidAt: timestamp("paid_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_payments_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "salary_payments_employeeId_br_fk",
      table.branchId,
      table.employeeId,
      (): AnyMySqlColumn => employees.branchId,
      (): AnyMySqlColumn => employees.id,
    ),
    uniqueIndex("salary_payments_employee_month_uidx").on(
      table.branchId,
      table.employeeId,
      table.periodMonth,
    ),
    index("salary_payments_paid_at_idx").on(table.paidAt),
    check(
      "salary_payments_amounts_nonnegative_chk",
      sql`${table.basePay} >= 0 AND ${table.bonuses} >= 0 AND ${table.deductions} >= 0 AND ${table.advances} >= 0 AND ${table.netPay} >= 0`,
    ),
  ],
);

// two levels only: main (parentId null) → sub (parentId = a main category)
