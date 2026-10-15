import {
  mysqlTable,
  varchar,
  int,
  decimal,
  boolean,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { users } from "./org.js";
import { items } from "./catalog.js";
import { recipeSizes, recipes } from "./recipes.js";
import { externalProductSizes, externalProducts } from "./external.js";
import { shifts } from "./shifts.js";

export const orders = mysqlTable(
  "orders",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    orderNumber: varchar("order_number", { length: 64 }).notNull(),
    clientRequestId: varchar("client_request_id", { length: 36 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    cashierId: uuidColumn("cashier_id")
      .notNull()
      .references(() => users.id),
    shiftId: uuidColumn("shift_id").references(() => shifts.id),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountType: mysqlEnum("discount_type", ["percent", "fixed"]),
    discountValue: decimal("discount_value", {
      precision: 12,
      scale: 2,
    }),
    discountAmount: decimal("discount_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    cashReceived: decimal("cash_received", {
      precision: 12,
      scale: 2,
    }).notNull(),
    changeAmount: decimal("change_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalCost: decimal("total_cost", { precision: 30, scale: 2 })
      .notNull()
      .default("0"),
    isNegativeStock: boolean("is_negative_stock").notNull().default(false),
    isAdminSale: boolean("is_admin_sale").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_branch_id_uidx").on(table.branchId, table.id),
    uniqueIndex("orders_orderNumber_branch_uidx").on(
      table.branchId,
      table.orderNumber,
    ),
    uniqueIndex("orders_clientRequestId_branch_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
    scopedReference(
      "orders_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_cashier_created_idx").on(table.cashierId, table.createdAt),
    index("orders_shift_id_idx").on(table.shiftId),
  ],
);

export const orderLines = mysqlTable(
  "order_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    orderId: uuidColumn("order_id")
      .notNull()
      .references(() => orders.id),
    type: mysqlEnum("type", ["recipe", "item", "external_product"]).notNull(),
    recipeId: uuidColumn("recipe_id").references(() => recipes.id),
    recipeSizeId: uuidColumn("recipe_size_id").references(
      () => recipeSizes.id,
      {
        onDelete: "set null",
      },
    ),
    itemId: uuidColumn("item_id").references(() => items.id),
    externalProductId: int("external_product_id"),
    externalSizeId: int("external_size_id"),
    productName: varchar("product_name", { length: 191 }).notNull(),
    sizeName: varchar("size_name", { length: 100 }),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineSubtotal: decimal("line_subtotal", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalCost: decimal("total_cost", { precision: 30, scale: 2 })
      .notNull()
      .default("0"),
    hasStockDeficit: boolean("has_stock_deficit").notNull().default(false),
  },
  (table) => [
    uniqueIndex("order_lines_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "order_lines_orderId_br_fk",
      table.branchId,
      table.orderId,
      (): AnyMySqlColumn => orders.branchId,
      (): AnyMySqlColumn => orders.id,
    ),
    scopedReference(
      "order_lines_recipeId_br_fk",
      table.branchId,
      table.recipeId,
      (): AnyMySqlColumn => recipes.branchId,
      (): AnyMySqlColumn => recipes.id,
    ),
    scopedReference(
      "order_lines_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "order_lines_externalProductId_br_fk",
      table.branchId,
      table.externalProductId,
      (): AnyMySqlColumn => externalProducts.branchId,
      (): AnyMySqlColumn => externalProducts.externalId,
    ),
    index("order_lines_order_id_idx").on(table.orderId),
    index("order_lines_recipe_id_idx").on(table.recipeId),
    index("order_lines_item_id_idx").on(table.itemId),
    index("order_lines_external_product_idx").on(table.externalProductId),
    foreignKey({
      name: "order_line_ext_size_fk",
      columns: [table.branchId, table.externalSizeId],
      foreignColumns: [
        externalProductSizes.branchId,
        externalProductSizes.externalId,
      ],
    }),
  ],
);

export const orderLineModifiers = mysqlTable(
  "order_line_modifiers",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    orderLineId: uuidColumn("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    externalModifierGroupId: int("external_modifier_group_id").notNull(),
    externalModifierOptionId: int("external_modifier_option_id").notNull(),
    groupName: varchar("group_name", { length: 191 }).notNull(),
    optionName: varchar("option_name", { length: 191 }).notNull(),
    quantity: int("quantity").notNull(),
    unitExtraPrice: decimal("unit_extra_price", {
      precision: 12,
      scale: 2,
    }).notNull(),
  },
  (table) => [
    uniqueIndex("order_line_modifiers_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "order_line_modifiers_orderLineId_br_fk",
      table.branchId,
      table.orderLineId,
      (): AnyMySqlColumn => orderLines.branchId,
      (): AnyMySqlColumn => orderLines.id,
    ),
    index("order_line_modifiers_line_idx").on(table.orderLineId),
    uniqueIndex("order_line_modifiers_line_option_uidx").on(
      table.branchId,
      table.orderLineId,
      table.externalModifierOptionId,
    ),
  ],
);
