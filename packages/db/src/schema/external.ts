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
  primaryKey,
  foreignKey,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { items } from "./catalog.js";

export const externalCategories = mysqlTable(
  "external_categories",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }).notNull(),
    nameEn: varchar("name_en", { length: 191 }).notNull(),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    isActive: boolean("is_active").notNull(),
    isVisible: boolean("is_visible").notNull(),
    displayOrder: int("display_order").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.externalId] })],
);

export const externalProducts = mysqlTable(
  "external_products",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    externalCategoryId: int("external_category_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }).notNull(),
    nameEn: varchar("name_en", { length: 191 }).notNull(),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    imageUrl: varchar("image_url", { length: 2048 }),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    discountPercentage: decimal("discount_percentage", {
      precision: 5,
      scale: 2,
    }),
    discountStart: varchar("discount_start", { length: 40 }),
    discountEnd: varchar("discount_end", { length: 40 }),
    calories: int("calories").notNull(),
    pointsReward: int("points_reward").notNull(),
    isAvailable: boolean("is_available").notNull(),
    isVisible: boolean("is_visible").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.externalId] }),
    index("external_products_category_idx").on(table.externalCategoryId),
    index("external_products_current_idx").on(table.isCurrent),
    foreignKey({
      name: "ext_prod_cat_fk",
      columns: [table.branchId, table.externalCategoryId],
      foreignColumns: [
        externalCategories.branchId,
        externalCategories.externalId,
      ],
    }),
  ],
);

export const externalProductSizes = mysqlTable(
  "external_product_sizes",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    externalProductId: int("external_product_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }).notNull(),
    nameEn: varchar("name_en", { length: 191 }).notNull(),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    isDefault: boolean("is_default").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.externalId] }),
    index("external_product_sizes_product_idx").on(table.externalProductId),
    foreignKey({
      name: "ext_size_prod_fk",
      columns: [table.branchId, table.externalProductId],
      foreignColumns: [externalProducts.branchId, externalProducts.externalId],
    }),
  ],
);

export const externalModifierGroups = mysqlTable(
  "external_modifier_groups",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    externalProductId: int("external_product_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }),
    nameEn: varchar("name_en", { length: 191 }),
    isRequired: boolean("is_required").notNull(),
    maxSelections: int("max_selections").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.externalId] }),
    index("external_modifier_groups_product_idx").on(table.externalProductId),
    foreignKey({
      name: "ext_mod_grp_prod_fk",
      columns: [table.branchId, table.externalProductId],
      foreignColumns: [externalProducts.branchId, externalProducts.externalId],
    }),
  ],
);

export const externalModifierOptions = mysqlTable(
  "external_modifier_options",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    externalModifierGroupId: int("external_modifier_group_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }),
    nameEn: varchar("name_en", { length: 191 }),
    extraPrice: decimal("extra_price", { precision: 12, scale: 2 }).notNull(),
    stockEffect: mysqlEnum("stock_effect", ["incomplete", "mapped", "none"])
      .notNull()
      .default("incomplete"),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.externalId] }),
    index("external_modifier_options_group_idx").on(
      table.externalModifierGroupId,
    ),
    foreignKey({
      name: "ext_mod_opt_grp_fk",
      columns: [table.branchId, table.externalModifierGroupId],
      foreignColumns: [
        externalModifierGroups.branchId,
        externalModifierGroups.externalId,
      ],
    }),
  ],
);

export const externalProductIngredients = mysqlTable(
  "external_product_ingredients",
  {
    branchId: branchColumn(),
    externalProductId: int("external_product_id").notNull(),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    index("external_product_ingredients_branch_idx").on(table.branchId),
    scopedReference(
      "external_product_ingredients_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    primaryKey({
      name: "ext_product_ingredients_pk",
      columns: [table.branchId, table.externalProductId, table.itemId],
    }),
    index("external_product_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_prod_ing_prod_fk",
      columns: [table.branchId, table.externalProductId],
      foreignColumns: [externalProducts.branchId, externalProducts.externalId],
    }),
  ],
);

export const externalSizeIngredients = mysqlTable(
  "external_size_ingredients",
  {
    branchId: branchColumn(),
    externalSizeId: int("external_size_id").notNull(),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    index("external_size_ingredients_branch_idx").on(table.branchId),
    scopedReference(
      "external_size_ingredients_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    primaryKey({
      name: "ext_size_ingredients_pk",
      columns: [table.branchId, table.externalSizeId, table.itemId],
    }),
    index("external_size_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_size_ing_size_fk",
      columns: [table.branchId, table.externalSizeId],
      foreignColumns: [
        externalProductSizes.branchId,
        externalProductSizes.externalId,
      ],
    }),
  ],
);

export const externalModifierIngredients = mysqlTable(
  "external_modifier_ingredients",
  {
    branchId: branchColumn(),
    externalModifierOptionId: int("external_modifier_option_id").notNull(),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    index("external_modifier_ingredients_branch_idx").on(table.branchId),
    scopedReference(
      "external_modifier_ingredients_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    primaryKey({
      name: "ext_modifier_ingredients_pk",
      columns: [table.branchId, table.externalModifierOptionId, table.itemId],
    }),
    index("external_modifier_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_mod_ing_opt_fk",
      columns: [table.branchId, table.externalModifierOptionId],
      foreignColumns: [
        externalModifierOptions.branchId,
        externalModifierOptions.externalId,
      ],
    }),
  ],
);

export const externalCatalogSync = mysqlTable(
  "external_catalog_sync",
  {
    branchId: branchColumn(),
    id: int("id").notNull(),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { fsp: 3 }),
    lastAttemptAt: timestamp("last_attempt_at", { fsp: 3 }),
    lastFailedAt: timestamp("last_failed_at", { fsp: 3 }),
    lastError: varchar("last_error", { length: 500 }),
    refreshRequestedAt: timestamp("refresh_requested_at", { fsp: 3 }),
    refreshRequestVersion: int("refresh_request_version").notNull().default(0),
    completedRequestVersion: int("completed_request_version")
      .notNull()
      .default(0),
    lockOwner: varchar("lock_owner", { length: 191 }),
    lockExpiresAt: timestamp("lock_expires_at", { fsp: 3 }),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.id] })],
);

export const externalOrdersCache = mysqlTable(
  "external_orders_cache",
  {
    branchId: branchColumn(),
    externalId: int("external_id").notNull(),
    customerName: varchar("customer_name", { length: 191 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 32 }),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountAmount: decimal("discount_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
    deliveryFee: decimal("delivery_fee", { precision: 12, scale: 2 }).notNull(),
    externalCreatedAt: varchar("external_created_at", { length: 40 }).notNull(),
    orderStatus: mysqlEnum("order_status", [
      "pending",
      "completed",
      "cancelled",
      "unknown",
    ]).notNull(),
    paymentStatus: mysqlEnum("payment_status", [
      "pending",
      "paid",
      "failed",
      "cancelled",
      "unpaid",
      "unknown",
    ]).notNull(),
    paymentMethod: mysqlEnum("payment_method", [
      "cash_on_delivery",
      "online",
      "onsite",
      "unknown",
    ]).notNull(),
    orderType: mysqlEnum("order_type", [
      "pickup",
      "delivery",
      "unknown",
    ]).notNull(),
    itemCount: int("item_count").notNull(),
    cachedAt: timestamp("cached_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.externalId] }),
    index("external_orders_created_idx").on(table.externalCreatedAt),
    index("external_orders_customer_idx").on(table.customerName),
    index("external_orders_phone_idx").on(table.customerPhone),
  ],
);
