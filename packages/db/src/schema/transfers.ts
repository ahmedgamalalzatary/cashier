import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { users } from "./org.js";
import { purchaseInvoices, stockBatches } from "./purchasing.js";
import { items } from "./catalog.js";
import { shifts } from "./shifts.js";

export const transferRequests = mysqlTable(
  "transfer_requests",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    requestedBy: uuidColumn("requested_by")
      .notNull()
      .references(() => users.id),
    shiftId: uuidColumn("shift_id").references((): AnyMySqlColumn => shifts.id),
    notes: text("notes"),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    reviewedBy: uuidColumn("reviewed_by").references(() => users.id),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    reviewedAt: timestamp("reviewed_at"),
    clientRequestId: varchar("client_request_id", { length: 36 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transfer_requests_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "transfer_requests_shiftId_br_fk",
      table.branchId,
      table.shiftId,
      (): AnyMySqlColumn => shifts.branchId,
      (): AnyMySqlColumn => shifts.id,
    ),
    index("transfer_requests_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("transfer_requests_requested_by_idx").on(table.requestedBy),
    uniqueIndex("transfer_requests_client_request_uidx").on(
      table.branchId,
      table.clientRequestId,
    ),
  ],
);

export const transferRequestLines = mysqlTable(
  "transfer_request_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    requestId: uuidColumn("request_id")
      .notNull()
      .references(() => transferRequests.id),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("transfer_request_lines_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "transfer_request_lines_requestId_br_fk",
      table.branchId,
      table.requestId,
      (): AnyMySqlColumn => transferRequests.branchId,
      (): AnyMySqlColumn => transferRequests.id,
    ),
    scopedReference(
      "transfer_request_lines_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    index("transfer_request_lines_request_idx").on(table.requestId),
    uniqueIndex("transfer_request_lines_request_item_uidx").on(
      table.branchId,
      table.requestId,
      table.itemId,
    ),
  ],
);

export const transfers = mysqlTable(
  "transfers",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    requestId: uuidColumn("request_id").references(() => transferRequests.id),
    purchaseInvoiceId: uuidColumn("purchase_invoice_id").references(
      () => purchaseInvoices.id,
    ),
    createdBy: uuidColumn("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuidColumn("approved_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transfers_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "transfers_requestId_br_fk",
      table.branchId,
      table.requestId,
      (): AnyMySqlColumn => transferRequests.branchId,
      (): AnyMySqlColumn => transferRequests.id,
    ),
    uniqueIndex("transfers_request_id_uidx").on(
      table.branchId,
      table.requestId,
    ),
    scopedReference(
      "transfers_purchaseInvoiceId_br_fk",
      table.branchId,
      table.purchaseInvoiceId,
      (): AnyMySqlColumn => purchaseInvoices.branchId,
      (): AnyMySqlColumn => purchaseInvoices.id,
    ),
    index("transfers_purchase_invoice_id_idx").on(table.purchaseInvoiceId),
    index("transfers_created_at_idx").on(table.createdAt),
  ],
);

// One line per FIFO allocation keeps every carried main-batch cost auditable.

export const transferLines = mysqlTable(
  "transfer_lines",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    transferId: uuidColumn("transfer_id")
      .notNull()
      .references(() => transfers.id),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    sourceBatchId: uuidColumn("source_batch_id").references(
      () => stockBatches.id,
    ),
    cafeBatchId: uuidColumn("cafe_batch_id")
      .notNull()
      .references(() => stockBatches.id),
  },
  (table) => [
    uniqueIndex("transfer_lines_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "transfer_lines_transferId_br_fk",
      table.branchId,
      table.transferId,
      (): AnyMySqlColumn => transfers.branchId,
      (): AnyMySqlColumn => transfers.id,
    ),
    scopedReference(
      "transfer_lines_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "transfer_lines_sourceBatchId_br_fk",
      table.branchId,
      table.sourceBatchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    scopedReference(
      "transfer_lines_cafeBatchId_br_fk",
      table.branchId,
      table.cafeBatchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    index("transfer_lines_transfer_idx").on(table.transferId),
    index("transfer_lines_item_idx").on(table.itemId),
    uniqueIndex("transfer_lines_cafe_batch_uidx").on(
      table.branchId,
      table.cafeBatchId,
    ),
  ],
);
