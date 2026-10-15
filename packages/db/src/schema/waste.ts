import {
  mysqlTable,
  varchar,
  int,
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
import { users } from "./org.js";
import { items } from "./catalog.js";
import { stockBatches } from "./purchasing.js";
import { recipeSizes, recipes } from "./recipes.js";
import { externalProductSizes, externalProducts } from "./external.js";
import { shifts } from "./shifts.js";
import { refundLines } from "./refunds.js";
import { stockMovements } from "./stock.js";

export const wasteEntries = mysqlTable(
  "waste_entries",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 }),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
    shiftId: uuidColumn("shift_id").references(() => shifts.id),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    targetType: mysqlEnum("target_type", [
      "item",
      "recipe",
      "external_product",
    ]),
    itemId: uuidColumn("item_id").references(() => items.id),
    recipeId: uuidColumn("recipe_id").references(() => recipes.id),
    recipeSizeId: uuidColumn("recipe_size_id").references(() => recipeSizes.id),
    externalProductId: int("external_product_id"),
    externalSizeId: int("external_size_id"),
    targetName: varchar("target_name", { length: 191 }),
    sizeName: varchar("size_name", { length: 100 }),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    reasonCode: mysqlEnum("reason_code", [
      "expired",
      "damaged",
      "preparation_mistake",
      "spill",
      "other",
    ]),
    note: varchar("note", { length: 500 }),
    totalCost: decimal("total_cost", { precision: 30, scale: 2 }).notNull(),
    recordedBy: uuidColumn("recorded_by")
      .notNull()
      .references(() => users.id),
    refundLineId: uuidColumn("refund_line_id").references(() => refundLines.id),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("waste_entries_branch_id_uidx").on(table.branchId, table.id),
    uniqueIndex("waste_entries_clientRequestId_branch_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
    scopedReference(
      "waste_entries_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    scopedReference(
      "waste_entries_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "waste_entries_recipeId_br_fk",
      table.branchId,
      table.recipeId,
      (): AnyMySqlColumn => recipes.branchId,
      (): AnyMySqlColumn => recipes.id,
    ),
    scopedReference(
      "waste_entries_recipeSizeId_br_fk",
      table.branchId,
      table.recipeSizeId,
      (): AnyMySqlColumn => recipeSizes.branchId,
      (): AnyMySqlColumn => recipeSizes.id,
    ),
    scopedReference(
      "waste_entries_refundLineId_br_fk",
      table.branchId,
      table.refundLineId,
      (): AnyMySqlColumn => refundLines.branchId,
      (): AnyMySqlColumn => refundLines.id,
    ),
    uniqueIndex("waste_entries_refundLineId_branch_uidx").on(
      table.branchId,
      table.refundLineId,
    ),
    index("waste_entries_item_idx").on(table.itemId),
    index("waste_entries_shift_idx").on(table.shiftId),
    index("waste_entries_occurred_idx").on(table.occurredAt),
    foreignKey({
      name: "waste_ext_prod_fk",
      columns: [table.branchId, table.externalProductId],
      foreignColumns: [externalProducts.branchId, externalProducts.externalId],
    }),
    foreignKey({
      name: "waste_ext_size_fk",
      columns: [table.branchId, table.externalSizeId],
      foreignColumns: [
        externalProductSizes.branchId,
        externalProductSizes.externalId,
      ],
    }),
    check("waste_entries_quantity_positive_chk", sql`${table.quantity} > 0`),
    check("waste_entries_cost_nonnegative_chk", sql`${table.totalCost} >= 0`),
    check(
      "waste_entries_reason_nonblank_chk",
      sql`CHAR_LENGTH(TRIM(${table.reason})) > 0`,
    ),
    check(
      "waste_entries_direct_shape_chk",
      sql`${table.refundLineId} IS NOT NULL OR (
        ${table.clientRequestId} IS NOT NULL
        AND ${table.reasonCode} IS NOT NULL
        AND (
          (
            ${table.targetType} = 'item'
            AND ${table.itemId} IS NOT NULL
            AND ${table.recipeId} IS NULL
            AND ${table.recipeSizeId} IS NULL
            AND ${table.externalProductId} IS NULL
            AND ${table.externalSizeId} IS NULL
          )
          OR
          (
            ${table.targetType} = 'recipe'
            AND ${table.itemId} IS NULL
            AND ${table.recipeId} IS NOT NULL
            AND ${table.recipeSizeId} IS NOT NULL
            AND ${table.externalProductId} IS NULL
            AND ${table.externalSizeId} IS NULL
          )
          OR
          (
            ${table.targetType} = 'external_product'
            AND ${table.itemId} IS NULL
            AND ${table.recipeId} IS NULL
            AND ${table.recipeSizeId} IS NULL
            AND ${table.externalProductId} IS NOT NULL
          )
        )
      )`,
    ),
  ],
);

export const wasteAllocations = mysqlTable(
  "waste_allocations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    wasteEntryId: uuidColumn("waste_entry_id")
      .notNull()
      .references(() => wasteEntries.id),
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
    uniqueIndex("waste_allocations_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "waste_allocations_wasteEntryId_br_fk",
      table.branchId,
      table.wasteEntryId,
      (): AnyMySqlColumn => wasteEntries.branchId,
      (): AnyMySqlColumn => wasteEntries.id,
    ),
    scopedReference(
      "waste_allocations_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "waste_allocations_batchId_br_fk",
      table.branchId,
      table.batchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    scopedReference(
      "waste_allocations_stockMovementId_br_fk",
      table.branchId,
      table.stockMovementId,
      (): AnyMySqlColumn => stockMovements.branchId,
      (): AnyMySqlColumn => stockMovements.id,
    ),
    index("waste_allocations_entry_idx").on(table.wasteEntryId),
    index("waste_allocations_item_idx").on(table.itemId),
    uniqueIndex("waste_allocations_movement_uidx").on(
      table.branchId,
      table.stockMovementId,
    ),
    check(
      "waste_allocations_quantity_positive_chk",
      sql`${table.quantity} > 0`,
    ),
    check(
      "waste_allocations_cost_nonnegative_chk",
      sql`${table.unitCost} >= 0`,
    ),
  ],
);
