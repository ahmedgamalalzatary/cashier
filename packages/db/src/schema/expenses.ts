import {
  mysqlTable,
  varchar,
  decimal,
  boolean,
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
import { users } from "./org.js";
import { shifts } from "./shifts.js";

export const expenseCategories = mysqlTable(
  "expense_categories",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expense_categories_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    uniqueIndex("expense_categories_name_uidx").on(table.branchId, table.name),
  ],
);

export const expenses = mysqlTable(
  "expenses",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    type: mysqlEnum("type", ["shift", "general"]).notNull(),
    categoryId: uuidColumn("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    shiftId: uuidColumn("shift_id").references(() => shifts.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: uuidColumn("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expenses_branch_id_uidx").on(table.branchId, table.id),
    uniqueIndex("expenses_clientRequestId_branch_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
    scopedReference(
      "expenses_categoryId_br_fk",
      table.branchId,
      table.categoryId,
      (): AnyMySqlColumn => expenseCategories.branchId,
      (): AnyMySqlColumn => expenseCategories.id,
    ),
    scopedReference(
      "expenses_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    index("expenses_category_idx").on(table.categoryId),
    index("expenses_shift_idx").on(table.shiftId),
    index("expenses_date_idx").on(table.expenseDate),
    check("expenses_amount_positive_chk", sql`${table.amount} > 0`),
    check(
      "expenses_type_shift_chk",
      sql`((${table.type} = 'shift' AND ${table.shiftId} IS NOT NULL) OR (${table.type} = 'general' AND ${table.shiftId} IS NULL))`,
    ),
  ],
);
