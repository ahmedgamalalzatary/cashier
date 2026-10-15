import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
  date,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { users } from "./org.js";
import { items, suppliers } from "./catalog.js";

export const purchaseInvoices = mysqlTable(
  "purchase_invoices",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    supplierId: uuidColumn("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    purchasedAt: date("purchased_at", { mode: "string" }).notNull(),
    notes: text("notes"),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
    paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).notNull(),
    createdBy: uuidColumn("created_by")
      .notNull()
      .references(() => users.id),
    clientRequestId: varchar("client_request_id", { length: 36 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_invoices_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "purchase_invoices_supplierId_br_fk",
      table.branchId,
      table.supplierId,
      (): AnyMySqlColumn => suppliers.branchId,
      (): AnyMySqlColumn => suppliers.id,
    ),
    index("purchase_invoices_supplier_id_idx").on(table.supplierId),
    index("purchase_invoices_purchased_at_idx").on(table.purchasedAt),
    uniqueIndex("purchase_invoices_supplier_number_uidx").on(
      table.branchId,
      table.supplierId,
      table.invoiceNumber,
    ),
    uniqueIndex("purchase_invoices_client_request_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
  ],
);

export const supplierPayments = mysqlTable(
  "supplier_payments",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    supplierId: uuidColumn("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseInvoiceId: uuidColumn("purchase_invoice_id").references(
      () => purchaseInvoices.id,
    ),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paidAt: date("paid_at", { mode: "string" }).notNull(),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("supplier_payments_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "supplier_payments_supplierId_br_fk",
      table.branchId,
      table.supplierId,
      (): AnyMySqlColumn => suppliers.branchId,
      (): AnyMySqlColumn => suppliers.id,
    ),
    scopedReference(
      "supplier_payments_purchaseInvoiceId_br_fk",
      table.branchId,
      table.purchaseInvoiceId,
      (): AnyMySqlColumn => purchaseInvoices.branchId,
      (): AnyMySqlColumn => purchaseInvoices.id,
    ),
    index("supplier_payments_supplier_id_idx").on(table.supplierId),
    index("supplier_payments_invoice_id_idx").on(table.purchaseInvoiceId),
  ],
);

export const purchaseLines = mysqlTable(
  "purchase_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    invoiceId: uuidColumn("invoice_id")
      .notNull()
      .references(() => purchaseInvoices.id),
    itemId: uuidColumn("item_id")
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
    uniqueIndex("purchase_lines_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "purchase_lines_invoiceId_br_fk",
      table.branchId,
      table.invoiceId,
      (): AnyMySqlColumn => purchaseInvoices.branchId,
      (): AnyMySqlColumn => purchaseInvoices.id,
    ),
    scopedReference(
      "purchase_lines_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    index("purchase_lines_invoice_id_idx").on(table.invoiceId),
    index("purchase_lines_item_id_idx").on(table.itemId),
  ],
);

export const stockBatches = mysqlTable(
  "stock_batches",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    itemId: uuidColumn("item_id")
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
    sourceId: uuidColumn("source_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_batches_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "stock_batches_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    index("stock_batches_fifo_idx").on(
      table.itemId,
      table.warehouse,
      table.receivedAt,
      table.id,
    ),
  ],
);
