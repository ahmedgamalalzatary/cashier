import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
  type AnyMySqlColumn,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { items } from "./catalog.js";
import { stockBatches } from "./purchasing.js";
import { orderLines } from "./orders.js";
import { refundLines } from "./refunds.js";

export const stockMovements = mysqlTable(
  "stock_movements",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    batchId: uuidColumn("batch_id").references(() => stockBatches.id),
    movementType: varchar("movement_type", { length: 50 }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: uuidColumn("reference_id"),
    notes: varchar("notes", { length: 255 }),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_movements_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "stock_movements_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "stock_movements_batchId_br_fk",
      table.branchId,
      table.batchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    index("stock_movements_ledger_idx").on(
      table.itemId,
      table.warehouse,
      table.occurredAt,
      table.id,
    ),
    index("stock_movements_batch_id_idx").on(table.batchId),
  ],
);

// When sales are allowed to take stock negative, later receipts allocate their
// real batch cost back to those uncosted deficit movements for audit/reporting.

export const stockDeficitAllocations = mysqlTable(
  "stock_deficit_allocations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    deficitMovementId: uuidColumn("deficit_movement_id").notNull(),
    batchId: uuidColumn("batch_id").notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_deficit_allocations_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    index("stock_deficit_allocations_movement_idx").on(table.deficitMovementId),
    index("stock_deficit_allocations_batch_idx").on(table.batchId),
    foreignKey({
      name: "stock_deficit_movement_fk",
      columns: [table.branchId, table.deficitMovementId],
      foreignColumns: [stockMovements.branchId, stockMovements.id],
    }),
    foreignKey({
      name: "stock_deficit_batch_fk",
      columns: [table.branchId, table.batchId],
      foreignColumns: [stockBatches.branchId, stockBatches.id],
    }),
  ],
);

export const orderLineAllocations = mysqlTable(
  "order_line_allocations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    orderLineId: uuidColumn("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    itemName: varchar("item_name", { length: 191 }).notNull(),
    batchId: uuidColumn("batch_id").references(() => stockBatches.id),
    stockMovementId: uuidColumn("stock_movement_id")
      .notNull()
      .references(() => stockMovements.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex("order_line_allocations_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "order_line_allocations_orderLineId_br_fk",
      table.branchId,
      table.orderLineId,
      (): AnyMySqlColumn => orderLines.branchId,
      (): AnyMySqlColumn => orderLines.id,
    ),
    scopedReference(
      "order_line_allocations_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "order_line_allocations_batchId_br_fk",
      table.branchId,
      table.batchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    scopedReference(
      "order_line_allocations_stockMovementId_br_fk",
      table.branchId,
      table.stockMovementId,
      (): AnyMySqlColumn => stockMovements.branchId,
      (): AnyMySqlColumn => stockMovements.id,
    ),
    index("order_line_allocations_line_idx").on(table.orderLineId),
    index("order_line_allocations_item_idx").on(table.itemId),
    uniqueIndex("order_line_allocations_movement_uidx").on(
      table.branchId,
      table.stockMovementId,
    ),
  ],
);

export const refundLineAllocations = mysqlTable(
  "refund_line_allocations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    refundLineId: uuidColumn("refund_line_id")
      .notNull()
      .references(() => refundLines.id),
    orderLineAllocationId: uuidColumn("order_line_allocation_id").notNull(),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    returnedBatchId: uuidColumn("returned_batch_id"),
  },
  (table) => [
    uniqueIndex("refund_line_allocations_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "refund_line_allocations_refundLineId_br_fk",
      table.branchId,
      table.refundLineId,
      (): AnyMySqlColumn => refundLines.branchId,
      (): AnyMySqlColumn => refundLines.id,
    ),
    scopedReference(
      "refund_line_allocations_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    index("refund_line_allocations_refund_line_idx").on(table.refundLineId),
    index("refund_line_allocations_order_allocation_idx").on(
      table.orderLineAllocationId,
    ),
    foreignKey({
      name: "refund_alloc_order_alloc_fk",
      columns: [table.branchId, table.orderLineAllocationId],
      foreignColumns: [orderLineAllocations.branchId, orderLineAllocations.id],
    }),
    foreignKey({
      name: "refund_alloc_batch_fk",
      columns: [table.branchId, table.returnedBatchId],
      foreignColumns: [stockBatches.branchId, stockBatches.id],
    }),
    check("refund_alloc_quantity_positive_chk", sql`${table.quantity} > 0`),
    check("refund_alloc_cost_nonnegative_chk", sql`${table.unitCost} >= 0`),
  ],
);
