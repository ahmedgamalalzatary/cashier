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
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  tokenVersion: int('token_version').notNull().default(0),
  role: mysqlEnum('role', ['admin', 'cashier']).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// two levels only: main (parentId null) → sub (parentId = a main category)
export const categories = mysqlTable(
  'categories',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 191 }).notNull(),
    parentId: int('parent_id').references((): AnyMySqlColumn => categories.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('categories_parent_id_idx').on(table.parentId)],
);

export const suppliers = mysqlTable('suppliers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  address: varchar('address', { length: 255 }),
  notes: text('notes'),
  openingBalance: decimal('opening_balance', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const purchaseInvoices = mysqlTable(
  'purchase_invoices',
  {
    id: int('id').autoincrement().primaryKey(),
    supplierId: int('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    purchasedAt: date('purchased_at', { mode: 'string' }).notNull(),
    notes: text('notes'),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).notNull(),
    createdBy: int('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('purchase_invoices_supplier_id_idx').on(table.supplierId),
    index('purchase_invoices_purchased_at_idx').on(table.purchasedAt),
    uniqueIndex('purchase_invoices_supplier_number_uidx').on(
      table.supplierId,
      table.invoiceNumber,
    ),
  ],
);

export const supplierPayments = mysqlTable(
  'supplier_payments',
  {
    id: int('id').autoincrement().primaryKey(),
    supplierId: int('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseInvoiceId: int('purchase_invoice_id').references(
      () => purchaseInvoices.id,
    ),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: date('paid_at', { mode: 'string' }).notNull(),
    notes: varchar('notes', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('supplier_payments_supplier_id_idx').on(table.supplierId),
    index('supplier_payments_invoice_id_idx').on(table.purchaseInvoiceId),
  ],
);

export const items = mysqlTable(
  'items',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 191 }).notNull(),
    categoryId: int('category_id')
      .notNull()
      .references(() => categories.id),
    type: mysqlEnum('type', ['raw', 'resale', 'prepared']).notNull(),
    stockUnit: varchar('stock_unit', { length: 50 }).notNull(),
    purchaseUnit: varchar('purchase_unit', { length: 50 }),
    purchaseToStockFactor: decimal('purchase_to_stock_factor', {
      precision: 14,
      scale: 6,
    }),
    mainMinimumLevel: decimal('main_minimum_level', {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default('0'),
    cafeMinimumLevel: decimal('cafe_minimum_level', {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('items_category_id_idx').on(table.categoryId)],
);

export const purchaseLines = mysqlTable(
  'purchase_lines',
  {
    id: int('id').autoincrement().primaryKey(),
    invoiceId: int('invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id),
    itemId: int('item_id')
      .notNull()
      .references(() => items.id),
    quantity: decimal('quantity', { precision: 14, scale: 3 }).notNull(),
    unitMode: mysqlEnum('unit_mode', ['stock', 'purchase']).notNull(),
    stockQuantity: decimal('stock_quantity', {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 16, scale: 6 }).notNull(),
    lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    index('purchase_lines_invoice_id_idx').on(table.invoiceId),
    index('purchase_lines_item_id_idx').on(table.itemId),
  ],
);

export const stockBatches = mysqlTable(
  'stock_batches',
  {
    id: int('id').autoincrement().primaryKey(),
    itemId: int('item_id')
      .notNull()
      .references(() => items.id),
    warehouse: mysqlEnum('warehouse', ['main', 'cafe']).notNull(),
    initialQuantity: decimal('initial_quantity', {
      precision: 14,
      scale: 3,
    }).notNull(),
    remainingQuantity: decimal('remaining_quantity', {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitCost: decimal('unit_cost', { precision: 16, scale: 6 }).notNull(),
    receivedAt: timestamp('received_at').notNull(),
    sourceType: varchar('source_type', { length: 50 }).notNull(),
    sourceId: int('source_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('stock_batches_fifo_idx').on(
      table.itemId,
      table.warehouse,
      table.receivedAt,
      table.id,
    ),
  ],
);

export const stockMovements = mysqlTable(
  'stock_movements',
  {
    id: int('id').autoincrement().primaryKey(),
    itemId: int('item_id')
      .notNull()
      .references(() => items.id),
    warehouse: mysqlEnum('warehouse', ['main', 'cafe']).notNull(),
    batchId: int('batch_id').references(() => stockBatches.id),
    movementType: varchar('movement_type', { length: 50 }).notNull(),
    quantity: decimal('quantity', { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 16, scale: 6 }).notNull(),
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: int('reference_id'),
    notes: varchar('notes', { length: 255 }),
    occurredAt: timestamp('occurred_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('stock_movements_ledger_idx').on(
      table.itemId,
      table.warehouse,
      table.occurredAt,
      table.id,
    ),
    index('stock_movements_batch_id_idx').on(table.batchId),
  ],
);

// When sales are allowed to take stock negative, later receipts allocate their
// real batch cost back to those uncosted deficit movements for audit/reporting.
export const stockDeficitAllocations = mysqlTable(
  'stock_deficit_allocations',
  {
    id: int('id').autoincrement().primaryKey(),
    deficitMovementId: int('deficit_movement_id').notNull(),
    batchId: int('batch_id').notNull(),
    quantity: decimal('quantity', { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 16, scale: 6 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('stock_deficit_allocations_movement_idx').on(table.deficitMovementId),
    index('stock_deficit_allocations_batch_idx').on(table.batchId),
    foreignKey({
      name: 'stock_deficit_movement_fk',
      columns: [table.deficitMovementId],
      foreignColumns: [stockMovements.id],
    }),
    foreignKey({
      name: 'stock_deficit_batch_fk',
      columns: [table.batchId],
      foreignColumns: [stockBatches.id],
    }),
  ],
);
