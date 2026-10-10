import mysql, { type Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { closeDb, createDb } from "../../src/client.js";
import { loadTestEnvironment } from "./test-env.js";
import { TEST_BRANCH_ID } from "./ids.js";

const testUrl = loadTestEnvironment();

export const db = createDb(testUrl);

const tables = [
  "admin_branches",
  "devices",
  "link_codes",
  "sync_outbox",
  "sync_state",
  "sync_ingest_events",
  "sync_ingest_rows",
  "sync_ingest_pending",
  "stocktake_lines",
  "stocktakes",
  "expenses",
  "expense_categories",
  "waste_allocations",
  "waste_entries",
  "refund_line_allocations",
  "refund_lines",
  "refunds",
  "order_line_allocations",
  "order_line_modifiers",
  "order_lines",
  "orders",
  "shift_events",
  "shifts",
  "preparation_allocations",
  "preparations",
  "recipe_ingredients",
  "recipe_sizes",
  "recipes",
  "transfer_lines",
  "transfers",
  "transfer_request_lines",
  "transfer_requests",
  "purchase_lines",
  "purchase_invoices",
  "stock_deficit_allocations",
  "stock_movements",
  "stock_batches",
  "external_modifier_ingredients",
  "external_size_ingredients",
  "external_product_ingredients",
  "external_modifier_options",
  "external_modifier_groups",
  "external_product_sizes",
  "external_products",
  "external_categories",
  "external_catalog_sync",
  "external_orders_cache",
  "items",
  "supplier_payments",
  "suppliers",
  "categories",
  "users",
  "employees",
] as const;

let cleanupConnection: Connection;

/** Empties every business table so the next test starts from a known database. */
export async function cleanupTables() {
  const deletes = tables.map((table) => `DELETE FROM \`${table}\``).join("; ");
  await cleanupConnection.query("SET FOREIGN_KEY_CHECKS = 0");
  await cleanupConnection.query("SET @cashier_sync_apply = 1");
  try {
    await cleanupConnection.query(deletes);
    await cleanupConnection.query("DELETE FROM branches");
    await cleanupConnection.query(
      "INSERT INTO branches (id, name, is_active) VALUES (?, 'الفرع الرئيسي', true)",
      [TEST_BRANCH_ID],
    );
  } finally {
    await cleanupConnection.query("SET @cashier_sync_apply = NULL");
    await cleanupConnection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

beforeAll(async () => {
  cleanupConnection = await mysql.createConnection({
    uri: testUrl,
    multipleStatements: true,
  });
});

beforeEach(cleanupTables);

afterAll(async () => {
  await Promise.all([cleanupConnection.end(), closeDb(db)]);
});
