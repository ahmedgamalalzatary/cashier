// Tables per docs/system-specs.md §15 — added incrementally per feature
import {
  mysqlTable,
  varchar,
  int,
  decimal,
  boolean,
  timestamp,
  date,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
  type AnyMySqlColumn,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  jobTitle: varchar("job_title", { length: 100 }),
  hireDate: date("hire_date", { mode: "string" }),
  payType: mysqlEnum("pay_type", ["monthly", "daily", "hourly"]),
  payRate: decimal("pay_rate", { precision: 12, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id").references(() => employees.id),
    name: varchar("name", { length: 191 }).notNull(),
    username: varchar("username", { length: 100 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    tokenVersion: int("token_version").notNull().default(0),
    role: mysqlEnum("role", ["admin", "cashier"]).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_employee_id_uidx").on(table.employeeId)],
);

// two levels only: main (parentId null) → sub (parentId = a main category)
export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    parentId: int("parent_id").references((): AnyMySqlColumn => categories.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("categories_parent_id_idx").on(table.parentId)],
);

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  address: varchar("address", { length: 255 }),
  notes: text("notes"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseInvoices = mysqlTable(
  "purchase_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    purchasedAt: date("purchased_at", { mode: "string" }).notNull(),
    notes: text("notes"),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
    paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).notNull(),
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("purchase_invoices_supplier_id_idx").on(table.supplierId),
    index("purchase_invoices_purchased_at_idx").on(table.purchasedAt),
    uniqueIndex("purchase_invoices_supplier_number_uidx").on(
      table.supplierId,
      table.invoiceNumber,
    ),
  ],
);

export const supplierPayments = mysqlTable(
  "supplier_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseInvoiceId: int("purchase_invoice_id").references(
      () => purchaseInvoices.id,
    ),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paidAt: date("paid_at", { mode: "string" }).notNull(),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("supplier_payments_supplier_id_idx").on(table.supplierId),
    index("supplier_payments_invoice_id_idx").on(table.purchaseInvoiceId),
  ],
);

export const items = mysqlTable(
  "items",
  {
    id: int("id").autoincrement().primaryKey(),
    // system-assigned sequential display code (0001, 0002, …); never reused
    code: int("code").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    categoryId: int("category_id")
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
    index("items_category_id_idx").on(table.categoryId),
    uniqueIndex("items_code_uidx").on(table.code),
  ],
);

export const purchaseLines = mysqlTable(
  "purchase_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoice_id")
      .notNull()
      .references(() => purchaseInvoices.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitMode: mysqlEnum("unit_mode", ["stock", "purchase"]).notNull(),
    stockQuantity: decimal("stock_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    index("purchase_lines_invoice_id_idx").on(table.invoiceId),
    index("purchase_lines_item_id_idx").on(table.itemId),
  ],
);

export const stockBatches = mysqlTable(
  "stock_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    initialQuantity: decimal("initial_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    remainingQuantity: decimal("remaining_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    receivedAt: timestamp("received_at").notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    sourceId: int("source_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("stock_batches_fifo_idx").on(
      table.itemId,
      table.warehouse,
      table.receivedAt,
      table.id,
    ),
  ],
);

export const transferRequests = mysqlTable(
  "transfer_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    requestedBy: int("requested_by")
      .notNull()
      .references(() => users.id),
    shiftId: int("shift_id").references((): AnyMySqlColumn => shifts.id),
    notes: text("notes"),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    reviewedBy: int("reviewed_by").references(() => users.id),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("transfer_requests_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("transfer_requests_requested_by_idx").on(table.requestedBy),
  ],
);

export const transferRequestLines = mysqlTable(
  "transfer_request_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("request_id")
      .notNull()
      .references(() => transferRequests.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    index("transfer_request_lines_request_idx").on(table.requestId),
    uniqueIndex("transfer_request_lines_request_item_uidx").on(
      table.requestId,
      table.itemId,
    ),
  ],
);

export const transfers = mysqlTable(
  "transfers",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("request_id").references(() => transferRequests.id),
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: int("approved_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transfers_request_id_uidx").on(table.requestId),
    index("transfers_created_at_idx").on(table.createdAt),
  ],
);

// One line per FIFO allocation keeps every carried main-batch cost auditable.
export const transferLines = mysqlTable(
  "transfer_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    transferId: int("transfer_id")
      .notNull()
      .references(() => transfers.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    sourceBatchId: int("source_batch_id")
      .notNull()
      .references(() => stockBatches.id),
    cafeBatchId: int("cafe_batch_id")
      .notNull()
      .references(() => stockBatches.id),
  },
  (table) => [
    index("transfer_lines_transfer_idx").on(table.transferId),
    index("transfer_lines_item_idx").on(table.itemId),
    uniqueIndex("transfer_lines_cafe_batch_uidx").on(table.cafeBatchId),
  ],
);

export const recipes = mysqlTable(
  "recipes",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    type: mysqlEnum("type", ["product", "prepared"]).notNull(),
    categoryId: int("category_id")
      .notNull()
      .references(() => categories.id),
    outputItemId: int("output_item_id").references(() => items.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("recipes_category_id_idx").on(table.categoryId),
    uniqueIndex("recipes_output_item_id_uidx").on(table.outputItemId),
  ],
);

export const recipeSizes = mysqlTable(
  "recipe_sizes",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipe_id")
      .notNull()
      .references(() => recipes.id),
    name: varchar("name", { length: 100 }).notNull(),
    sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
    outputQuantity: decimal("output_quantity", { precision: 14, scale: 3 }),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("recipe_sizes_recipe_name_uidx").on(table.recipeId, table.name),
    index("recipe_sizes_recipe_id_idx").on(table.recipeId),
  ],
);

export const recipeIngredients = mysqlTable(
  "recipe_ingredients",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeSizeId: int("recipe_size_id")
      .notNull()
      .references(() => recipeSizes.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("recipe_ingredients_size_item_uidx").on(
      table.recipeSizeId,
      table.itemId,
    ),
    index("recipe_ingredients_item_id_idx").on(table.itemId),
  ],
);

export const externalCategories = mysqlTable("external_categories", {
  externalId: int("external_id").primaryKey(),
  nameAr: varchar("name_ar", { length: 191 }).notNull(),
  nameEn: varchar("name_en", { length: 191 }).notNull(),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  isActive: boolean("is_active").notNull(),
  isVisible: boolean("is_visible").notNull(),
  displayOrder: int("display_order").notNull(),
  isCurrent: boolean("is_current").notNull().default(true),
  syncedAt: timestamp("synced_at").notNull(),
});

export const externalProducts = mysqlTable(
  "external_products",
  {
    externalId: int("external_id").primaryKey(),
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
    index("external_products_category_idx").on(table.externalCategoryId),
    index("external_products_current_idx").on(table.isCurrent),
    foreignKey({
      name: "ext_prod_cat_fk",
      columns: [table.externalCategoryId],
      foreignColumns: [externalCategories.externalId],
    }),
  ],
);

export const externalProductSizes = mysqlTable(
  "external_product_sizes",
  {
    externalId: int("external_id").primaryKey(),
    externalProductId: int("external_product_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }).notNull(),
    nameEn: varchar("name_en", { length: 191 }).notNull(),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    isDefault: boolean("is_default").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    index("external_product_sizes_product_idx").on(table.externalProductId),
    foreignKey({
      name: "ext_size_prod_fk",
      columns: [table.externalProductId],
      foreignColumns: [externalProducts.externalId],
    }),
  ],
);

export const externalModifierGroups = mysqlTable(
  "external_modifier_groups",
  {
    externalId: int("external_id").primaryKey(),
    externalProductId: int("external_product_id").notNull(),
    nameAr: varchar("name_ar", { length: 191 }),
    nameEn: varchar("name_en", { length: 191 }),
    isRequired: boolean("is_required").notNull(),
    maxSelections: int("max_selections").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    index("external_modifier_groups_product_idx").on(table.externalProductId),
    foreignKey({
      name: "ext_mod_grp_prod_fk",
      columns: [table.externalProductId],
      foreignColumns: [externalProducts.externalId],
    }),
  ],
);

export const externalModifierOptions = mysqlTable(
  "external_modifier_options",
  {
    externalId: int("external_id").primaryKey(),
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
    index("external_modifier_options_group_idx").on(
      table.externalModifierGroupId,
    ),
    foreignKey({
      name: "ext_mod_opt_grp_fk",
      columns: [table.externalModifierGroupId],
      foreignColumns: [externalModifierGroups.externalId],
    }),
  ],
);

export const externalProductIngredients = mysqlTable(
  "external_product_ingredients",
  {
    externalProductId: int("external_product_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("external_product_ingredients_uidx").on(
      table.externalProductId,
      table.itemId,
    ),
    index("external_product_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_prod_ing_prod_fk",
      columns: [table.externalProductId],
      foreignColumns: [externalProducts.externalId],
    }),
  ],
);

export const externalSizeIngredients = mysqlTable(
  "external_size_ingredients",
  {
    externalSizeId: int("external_size_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("external_size_ingredients_uidx").on(
      table.externalSizeId,
      table.itemId,
    ),
    index("external_size_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_size_ing_size_fk",
      columns: [table.externalSizeId],
      foreignColumns: [externalProductSizes.externalId],
    }),
  ],
);

export const externalModifierIngredients = mysqlTable(
  "external_modifier_ingredients",
  {
    externalModifierOptionId: int("external_modifier_option_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("external_modifier_ingredients_uidx").on(
      table.externalModifierOptionId,
      table.itemId,
    ),
    index("external_modifier_ingredients_item_idx").on(table.itemId),
    foreignKey({
      name: "ext_mod_ing_opt_fk",
      columns: [table.externalModifierOptionId],
      foreignColumns: [externalModifierOptions.externalId],
    }),
  ],
);

export const externalCatalogSync = mysqlTable("external_catalog_sync", {
  id: int("id").primaryKey(),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at"),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastError: varchar("last_error", { length: 500 }),
});

export const preparations = mysqlTable(
  "preparations",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipe_id")
      .notNull()
      .references(() => recipes.id),
    recipeName: varchar("recipe_name", { length: 191 }).notNull(),
    outputItemId: int("output_item_id")
      .notNull()
      .references(() => items.id),
    outputItemName: varchar("output_item_name", { length: 191 }).notNull(),
    producedQuantity: decimal("produced_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    totalCost: decimal("total_cost", { precision: 30, scale: 2 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    outputBatchId: int("output_batch_id").references(() => stockBatches.id),
    preparedBy: int("prepared_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("preparations_recipe_id_idx").on(table.recipeId),
    index("preparations_occurred_at_idx").on(table.occurredAt),
    uniqueIndex("preparations_output_batch_uidx").on(table.outputBatchId),
  ],
);

export const preparationAllocations = mysqlTable(
  "preparation_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    preparationId: int("preparation_id")
      .notNull()
      .references(() => preparations.id),
    ingredientItemId: int("ingredient_item_id")
      .notNull()
      .references(() => items.id),
    ingredientItemName: varchar("ingredient_item_name", {
      length: 191,
    }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    sourceBatchId: int("source_batch_id")
      .notNull()
      .references(() => stockBatches.id),
  },
  (table) => [
    index("preparation_allocations_preparation_idx").on(table.preparationId),
    index("preparation_allocations_item_idx").on(table.ingredientItemId),
  ],
);

export const shifts = mysqlTable(
  "shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    cashierUserId: int("cashier_user_id")
      .notNull()
      .references(() => users.id),
    employeeId: int("employee_id")
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
    closedByUserId: int("closed_by_user_id").references(() => users.id),
    actualCash: decimal("actual_cash", { precision: 12, scale: 2 }),
    expectedCash: decimal("expected_cash", { precision: 12, scale: 2 }),
    overShort: decimal("over_short", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shifts_open_slot_uidx").on(table.openSlot),
    index("shifts_cashier_opened_idx").on(table.cashierUserId, table.openedAt),
    index("shifts_employee_opened_idx").on(table.employeeId, table.openedAt),
  ],
);

export const shiftEvents = mysqlTable(
  "shift_events",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftId: int("shift_id")
      .notNull()
      .references(() => shifts.id),
    action: mysqlEnum("action", [
      "open",
      "close",
      "admin_close",
      "reopen",
      "correction",
    ]).notNull(),
    actorUserId: int("actor_user_id")
      .notNull()
      .references(() => users.id),
    note: varchar("note", { length: 500 }),
    openingFloat: decimal("opening_float", { precision: 12, scale: 2 }),
    actualCash: decimal("actual_cash", { precision: 12, scale: 2 }),
    expectedCash: decimal("expected_cash", { precision: 12, scale: 2 }),
    overShort: decimal("over_short", { precision: 12, scale: 2 }),
    occurredAt: timestamp("occurred_at").notNull(),
  },
  (table) => [
    index("shift_events_shift_occurred_idx").on(
      table.shiftId,
      table.occurredAt,
    ),
  ],
);

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNumber: varchar("order_number", { length: 64 }).notNull().unique(),
    clientRequestId: varchar("client_request_id", { length: 36 })
      .notNull()
      .unique(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    cashierId: int("cashier_id")
      .notNull()
      .references(() => users.id),
    shiftId: int("shift_id").references(() => shifts.id),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_cashier_created_idx").on(table.cashierId, table.createdAt),
    index("orders_shift_id_idx").on(table.shiftId),
  ],
);

export const orderLines = mysqlTable(
  "order_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id),
    type: mysqlEnum("type", ["recipe", "item", "external_product"]).notNull(),
    recipeId: int("recipe_id").references(() => recipes.id),
    recipeSizeId: int("recipe_size_id").references(() => recipeSizes.id, {
      onDelete: "set null",
    }),
    itemId: int("item_id").references(() => items.id),
    externalProductId: int("external_product_id").references(
      () => externalProducts.externalId,
    ),
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
    index("order_lines_order_id_idx").on(table.orderId),
    index("order_lines_recipe_id_idx").on(table.recipeId),
    index("order_lines_item_id_idx").on(table.itemId),
    index("order_lines_external_product_idx").on(table.externalProductId),
    foreignKey({
      name: "order_line_ext_size_fk",
      columns: [table.externalSizeId],
      foreignColumns: [externalProductSizes.externalId],
    }),
  ],
);

export const orderLineModifiers = mysqlTable(
  "order_line_modifiers",
  {
    id: int("id").autoincrement().primaryKey(),
    orderLineId: int("order_line_id")
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
    index("order_line_modifiers_line_idx").on(table.orderLineId),
    uniqueIndex("order_line_modifiers_line_option_uidx").on(
      table.orderLineId,
      table.externalModifierOptionId,
    ),
  ],
);

export const refunds = mysqlTable(
  "refunds",
  {
    id: int("id").autoincrement().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 })
      .notNull()
      .unique(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id),
    shiftId: int("shift_id")
      .notNull()
      .references(() => shifts.id),
    cashierId: int("cashier_id")
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("refunds_order_id_idx").on(table.orderId),
    index("refunds_shift_id_idx").on(table.shiftId),
    index("refunds_cashier_created_idx").on(table.cashierId, table.createdAt),
    check("refunds_amount_positive_chk", sql`${table.amount} > 0`),
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
    id: int("id").autoincrement().primaryKey(),
    refundId: int("refund_id")
      .notNull()
      .references(() => refunds.id),
    orderLineId: int("order_line_id")
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
      sql`((${table.type} = 'item' AND ${table.stockAction} IS NOT NULL) OR (${table.type} <> 'item' AND ${table.stockAction} IS NULL))`,
    ),
  ],
);

export const stockMovements = mysqlTable(
  "stock_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    batchId: int("batch_id").references(() => stockBatches.id),
    movementType: varchar("movement_type", { length: 50 }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: int("reference_id"),
    notes: varchar("notes", { length: 255 }),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
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
    id: int("id").autoincrement().primaryKey(),
    deficitMovementId: int("deficit_movement_id").notNull(),
    batchId: int("batch_id").notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("stock_deficit_allocations_movement_idx").on(table.deficitMovementId),
    index("stock_deficit_allocations_batch_idx").on(table.batchId),
    foreignKey({
      name: "stock_deficit_movement_fk",
      columns: [table.deficitMovementId],
      foreignColumns: [stockMovements.id],
    }),
    foreignKey({
      name: "stock_deficit_batch_fk",
      columns: [table.batchId],
      foreignColumns: [stockBatches.id],
    }),
  ],
);

export const orderLineAllocations = mysqlTable(
  "order_line_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    orderLineId: int("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    itemName: varchar("item_name", { length: 191 }).notNull(),
    batchId: int("batch_id").references(() => stockBatches.id),
    stockMovementId: int("stock_movement_id")
      .notNull()
      .references(() => stockMovements.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
  },
  (table) => [
    index("order_line_allocations_line_idx").on(table.orderLineId),
    index("order_line_allocations_item_idx").on(table.itemId),
    uniqueIndex("order_line_allocations_movement_uidx").on(
      table.stockMovementId,
    ),
  ],
);

export const refundLineAllocations = mysqlTable(
  "refund_line_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    refundLineId: int("refund_line_id")
      .notNull()
      .references(() => refundLines.id),
    orderLineAllocationId: int("order_line_allocation_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    returnedBatchId: int("returned_batch_id"),
  },
  (table) => [
    index("refund_line_allocations_refund_line_idx").on(table.refundLineId),
    index("refund_line_allocations_order_allocation_idx").on(
      table.orderLineAllocationId,
    ),
    foreignKey({
      name: "refund_alloc_order_alloc_fk",
      columns: [table.orderLineAllocationId],
      foreignColumns: [orderLineAllocations.id],
    }),
    foreignKey({
      name: "refund_alloc_batch_fk",
      columns: [table.returnedBatchId],
      foreignColumns: [stockBatches.id],
    }),
    check("refund_alloc_quantity_positive_chk", sql`${table.quantity} > 0`),
    check("refund_alloc_cost_nonnegative_chk", sql`${table.unitCost} >= 0`),
  ],
);

export const wasteEntries = mysqlTable(
  "waste_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 }).unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
    shiftId: int("shift_id").references(() => shifts.id),
    warehouse: mysqlEnum("warehouse", ["main", "cafe"]).notNull(),
    targetType: mysqlEnum("target_type", ["item", "recipe", "external_product"]),
    itemId: int("item_id").references(() => items.id),
    recipeId: int("recipe_id").references(() => recipes.id),
    recipeSizeId: int("recipe_size_id").references(() => recipeSizes.id),
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
    recordedBy: int("recorded_by")
      .notNull()
      .references(() => users.id),
    refundLineId: int("refund_line_id")
      .unique()
      .references(() => refundLines.id),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("waste_entries_item_idx").on(table.itemId),
    index("waste_entries_shift_idx").on(table.shiftId),
    index("waste_entries_occurred_idx").on(table.occurredAt),
    foreignKey({
      name: "waste_ext_prod_fk",
      columns: [table.externalProductId],
      foreignColumns: [externalProducts.externalId],
    }),
    foreignKey({
      name: "waste_ext_size_fk",
      columns: [table.externalSizeId],
      foreignColumns: [externalProductSizes.externalId],
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
    id: int("id").autoincrement().primaryKey(),
    wasteEntryId: int("waste_entry_id")
      .notNull()
      .references(() => wasteEntries.id),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id),
    itemName: varchar("item_name", { length: 191 }).notNull(),
    batchId: int("batch_id").references(() => stockBatches.id),
    stockMovementId: int("stock_movement_id")
      .notNull()
      .references(() => stockMovements.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
  },
  (table) => [
    index("waste_allocations_entry_idx").on(table.wasteEntryId),
    index("waste_allocations_item_idx").on(table.itemId),
    uniqueIndex("waste_allocations_movement_uidx").on(table.stockMovementId),
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

export const expenseCategories = mysqlTable(
  "expense_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("expense_categories_name_uidx").on(table.name)],
);

export const expenses = mysqlTable(
  "expenses",
  {
    id: int("id").autoincrement().primaryKey(),
    clientRequestId: varchar("client_request_id", { length: 36 })
      .notNull()
      .unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    type: mysqlEnum("type", ["shift", "general"]).notNull(),
    categoryId: int("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    shiftId: int("shift_id").references(() => shifts.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    note: varchar("note", { length: 500 }),
    recordedBy: int("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
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
