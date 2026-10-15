import {
  mysqlTable,
  varchar,
  bigint,
  tinyint,
  json,
  boolean,
  timestamp,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn } from "./base.js";

export const devices = mysqlTable(
  "devices",
  {
    id: id().primaryKey(),
    branchId: branchColumn(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    linkedAt: timestamp("linked_at", { fsp: 3 }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { fsp: 3 }),
    appVersion: varchar("app_version", { length: 64 }),
    lastUploadAt: timestamp("last_upload_at", { fsp: 3 }),
    backupGeneration: bigint("backup_generation", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .default(0),
    backupRequestId: uuidColumn("backup_request_id"),
    backupCompletedAt: timestamp("backup_completed_at", { fsp: 3 }),
    backupReplace: boolean("backup_replace").notNull().default(false),
    backupReplaceAll: boolean("backup_replace_all").notNull().default(false),
  },
  (table) => [uniqueIndex("devices_branch_uidx").on(table.branchId)],
);

export const linkCodes = mysqlTable(
  "link_codes",
  {
    codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
    branchId: branchColumn(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    usedAt: timestamp("used_at", { fsp: 3 }),
  },
  (table) => [index("link_codes_branch_idx").on(table.branchId)],
);

export const syncOutbox = mysqlTable("sync_outbox", {
  seq: bigint("seq", { mode: "number", unsigned: true })
    .autoincrement()
    .primaryKey(),
  tableName: varchar("table_name", { length: 64 }).notNull(),
  op: mysqlEnum("op", ["upsert", "delete"]).notNull(),
  pk: json("pk").$type<Record<string, unknown>>().notNull(),
  rowJson: json("row_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
});

export const syncIngestEvents = mysqlTable(
  "sync_ingest_events",
  {
    deviceId: uuidColumn("device_id")
      .notNull()
      .references(() => devices.id),
    seq: bigint("seq", { mode: "number", unsigned: true }).notNull(),
    generation: bigint("generation", { mode: "number", unsigned: true })
      .notNull()
      .default(0),
    appliedAt: timestamp("applied_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.generation, table.seq] }),
    index("sync_ingest_events_applied_idx").on(table.appliedAt),
  ],
);

/**
 * The newest sequence applied to each business row, tombstones included, so a
 * stale retry from an earlier batch cannot overwrite newer data or bring back
 * a deleted row.
 */

export const syncIngestRows = mysqlTable(
  "sync_ingest_rows",
  {
    deviceId: uuidColumn("device_id")
      .notNull()
      .references(() => devices.id),
    tableName: varchar("table_name", { length: 64 }).notNull(),
    rowKey: varchar("row_key", { length: 64 }).notNull(),
    lastSeq: bigint("last_seq", { mode: "number", unsigned: true }).notNull(),
    generation: bigint("generation", { mode: "number", unsigned: true })
      .notNull()
      .default(0),
    appliedAt: timestamp("applied_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.tableName, table.rowKey] }),
    index("sync_ingest_rows_device_idx").on(table.deviceId),
  ],
);

export const syncState = mysqlTable(
  "sync_state",
  {
    id: tinyint("id").primaryKey(),
    lastUploadedSeq: bigint("last_uploaded_seq", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .default(0),
    backupGeneration: bigint("backup_generation", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .default(0),
    /**
     * When this PC queued its one-time history capture. Queued work and upload
     * progress are not proof of it: a PC can have a pending change and still be
     * missing rows written before the capture triggers existed.
     */
    bootstrappedAt: timestamp("bootstrapped_at", { fsp: 3 }),
    lastSuccessAt: timestamp("last_success_at", { fsp: 3 }),
    lastError: text("last_error"),
    lastAttemptAt: timestamp("last_attempt_at", { fsp: 3 }),
  },
  (table) => [check("sync_state_singleton_chk", sql`${table.id} = 1`)],
);

/** Replacement snapshots are durable here until one atomic publication. */

export const syncIngestPending = mysqlTable(
  "sync_ingest_pending",
  {
    deviceId: uuidColumn("device_id")
      .notNull()
      .references(() => devices.id),
    generation: bigint("generation", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    tableName: varchar("table_name", { length: 64 }).notNull(),
    rowKey: varchar("row_key", { length: 64 }).notNull(),
    seq: bigint("seq", { mode: "number", unsigned: true }).notNull(),
    op: mysqlEnum("op", ["upsert", "delete"]).notNull(),
    pk: json("pk").$type<Record<string, unknown>>().notNull(),
    rowJson: json("row_json").$type<Record<string, unknown>>(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.deviceId,
        table.generation,
        table.tableName,
        table.rowKey,
      ],
    }),
  ],
);
