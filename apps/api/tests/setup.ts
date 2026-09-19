import mysql, { type Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { closeDb, createDb } from "../src/db/index.js";
import { loadTestEnvironment } from "./test-env.js";

const testUrl = loadTestEnvironment();

export const db = createDb(testUrl);
export const appOptions = {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["http://localhost:3000"],
  externalOrders: {
    baseUrl: "https://orders.example.com",
    phoneNumber: "01234567890",
    password: "server-only-password",
  },
};

// items.code is system-assigned and unique; fixtures that insert straight into
// the table have to supply their own. A monotonic counter stays unique across
// the cleanup that runs before every test.
let itemCodeCounter = 0;
export const nextTestItemCode = () => (itemCodeCounter += 1);

const tables = [
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

beforeAll(async () => {
  cleanupConnection = await mysql.createConnection({
    uri: testUrl,
    multipleStatements: true,
  });
});

beforeEach(async () => {
  const deletes = tables.map((table) => `DELETE FROM \`${table}\``).join("; ");
  await cleanupConnection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    await cleanupConnection.query(deletes);
  } finally {
    await cleanupConnection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
});

afterAll(async () => {
  await Promise.all([cleanupConnection.end(), closeDb(db)]);
});
