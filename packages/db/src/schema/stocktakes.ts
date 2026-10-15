import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { users } from "./org.js";
import { categories, items } from "./catalog.js";

export const stocktakes = mysqlTable(
  "stocktakes",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    kind: mysqlEnum("kind", ["stocktake", "manual"])
      .notNull()
      .default("stocktake"),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    categoryId: uuidColumn("category_id").references(() => categories.id),
    status: mysqlEnum("status", ["draft", "confirmed"])
      .notNull()
      .default("draft"),
    note: varchar("note", { length: 500 }),
    createdBy: uuidColumn("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (table) => [
    uniqueIndex("stocktakes_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "stocktakes_categoryId_br_fk",
      table.branchId,
      table.categoryId,
      (): AnyMySqlColumn => categories.branchId,
      (): AnyMySqlColumn => categories.id,
    ),
    index("stocktakes_created_at_idx").on(table.createdAt),
  ],
);

export const stocktakeLines = mysqlTable(
  "stocktake_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    stocktakeId: uuidColumn("stocktake_id")
      .notNull()
      .references(() => stocktakes.id),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    recordedQuantity: decimal("recorded_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    countedQuantity: decimal("counted_quantity", { precision: 14, scale: 3 }),
  },
  (table) => [
    uniqueIndex("stocktake_lines_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "stocktake_lines_stocktakeId_br_fk",
      table.branchId,
      table.stocktakeId,
      (): AnyMySqlColumn => stocktakes.branchId,
      (): AnyMySqlColumn => stocktakes.id,
    ),
    scopedReference(
      "stocktake_lines_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    uniqueIndex("stocktake_lines_document_item_uidx").on(
      table.branchId,
      table.stocktakeId,
      table.itemId,
    ),
    index("stocktake_lines_item_idx").on(table.itemId),
  ],
);
