import {
  mysqlTable,
  varchar,
  decimal,
  boolean,
  timestamp,
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
import { orderLines, orders } from "./orders.js";

export const refunds = mysqlTable(
  "refunds",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    orderId: uuidColumn("order_id")
      .notNull()
      .references(() => orders.id),
    shiftId: uuidColumn("shift_id").references(() => shifts.id),
    cashierId: uuidColumn("cashier_id")
      .notNull()
      .references(() => users.id),
    reason: varchar("reason", { length: 500 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    totalCostReturned: decimal("total_cost_returned", {
      precision: 30,
      scale: 2,
    })
      .notNull()
      .default("0"),
    isAdminRefund: boolean("is_admin_refund").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refunds_branch_id_uidx").on(table.branchId, table.id),
    uniqueIndex("refunds_clientRequestId_branch_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
    scopedReference(
      "refunds_orderId_br_fk",
      table.branchId,
      table.orderId,
      (): AnyMySqlColumn => orders.branchId,
      (): AnyMySqlColumn => orders.id,
    ),
    scopedReference(
      "refunds_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    index("refunds_order_id_idx").on(table.orderId),
    index("refunds_shift_id_idx").on(table.shiftId),
    index("refunds_cashier_created_idx").on(table.cashierId, table.createdAt),
    check("refunds_amount_positive_chk", sql`${table.amount} >= 0`),
    check(
      "refunds_reason_nonblank_chk",
      sql`CHAR_LENGTH(TRIM(${table.reason})) > 0`,
    ),
    check("refunds_cost_nonnegative_chk", sql`${table.totalCostReturned} >= 0`),
  ],
);

export const refundLines = mysqlTable(
  "refund_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    refundId: uuidColumn("refund_id")
      .notNull()
      .references(() => refunds.id),
    orderLineId: uuidColumn("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    type: mysqlEnum("type", ["recipe", "item", "external_product"]).notNull(),
    productName: varchar("product_name", { length: 191 }).notNull(),
    sizeName: varchar("size_name", { length: 100 }),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    refundAmount: decimal("refund_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    grossAmount: decimal("gross_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    stockAction: mysqlEnum("stock_action", [
      "return_to_stock",
      "not_returnable",
    ]),
    returnedCost: decimal("returned_cost", { precision: 30, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => [
    uniqueIndex("refund_lines_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "refund_lines_refundId_br_fk",
      table.branchId,
      table.refundId,
      (): AnyMySqlColumn => refunds.branchId,
      (): AnyMySqlColumn => refunds.id,
    ),
    scopedReference(
      "refund_lines_orderLineId_br_fk",
      table.branchId,
      table.orderLineId,
      (): AnyMySqlColumn => orderLines.branchId,
      (): AnyMySqlColumn => orderLines.id,
    ),
    index("refund_lines_refund_id_idx").on(table.refundId),
    index("refund_lines_order_line_idx").on(table.orderLineId),
    check("refund_lines_quantity_positive_chk", sql`${table.quantity} > 0`),
    check(
      "refund_lines_amount_nonnegative_chk",
      sql`${table.refundAmount} >= 0`,
    ),
    check("refund_lines_gross_nonnegative_chk", sql`${table.grossAmount} >= 0`),
    check("refund_lines_cost_nonnegative_chk", sql`${table.returnedCost} >= 0`),
    check(
      "refund_lines_action_type_chk",
      sql`((${table.type} IN ('item', 'external_product') AND ${table.stockAction} IS NOT NULL) OR (${table.type} = 'recipe' AND ${table.stockAction} IS NULL))`,
    ),
  ],
);
