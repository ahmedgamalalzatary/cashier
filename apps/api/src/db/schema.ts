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
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  tokenVersion: int("token_version").notNull().default(0),
  role: mysqlEnum("role", ["admin", "cashier"]).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  (table) => [index("items_category_id_idx").on(table.categoryId)],
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
    // Phase 8 adds the shifts table, FK, and open-shift enforcement.
    shiftId: int("shift_id"),
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
    type: mysqlEnum("type", ["recipe", "item"]).notNull(),
    recipeId: int("recipe_id").references(() => recipes.id),
    recipeSizeId: int("recipe_size_id").references(() => recipeSizes.id, {
      onDelete: "set null",
    }),
    itemId: int("item_id").references(() => items.id),
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
