import {
  mysqlTable,
  varchar,
  int,
  decimal,
  boolean,
  timestamp,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";

export const categories = mysqlTable(
  "categories",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    parentId: uuidColumn("parent_id").references(
      (): AnyMySqlColumn => categories.id,
    ),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "categories_parentId_br_fk",
      table.branchId,
      table.parentId,
      (): AnyMySqlColumn => table.branchId,
      (): AnyMySqlColumn => table.id,
    ),
    index("categories_parent_id_idx").on(table.parentId),
  ],
);

export const suppliers = mysqlTable(
  "suppliers",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    address: varchar("address", { length: 255 }),
    notes: text("notes"),
    openingBalance: decimal("opening_balance", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppliers_branch_id_uidx").on(table.branchId, table.id),
  ],
);

export const items = mysqlTable(
  "items",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    // system-assigned sequential display code (0001, 0002, …); never reused
    code: int("code").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    categoryId: uuidColumn("category_id")
      .notNull()
      .references(() => categories.id),
    type: mysqlEnum("type", ["raw", "resale", "prepared"]).notNull(),
    sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
    stockUnit: varchar("stock_unit", { length: 50 }).notNull(),
    purchaseUnit: varchar("purchase_unit", { length: 50 }),
    purchaseToStockFactor: decimal("purchase_to_stock_factor", {
      precision: 14,
      scale: 6,
    }),
    mainMinimumLevel: decimal("main_minimum_level", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    cafeMinimumLevel: decimal("cafe_minimum_level", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("items_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "items_categoryId_br_fk",
      table.branchId,
      table.categoryId,
      (): AnyMySqlColumn => categories.branchId,
      (): AnyMySqlColumn => categories.id,
    ),
    index("items_category_id_idx").on(table.categoryId),
    uniqueIndex("items_code_uidx").on(table.branchId, table.code),
  ],
);
