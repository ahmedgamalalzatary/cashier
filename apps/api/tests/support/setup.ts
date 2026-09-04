import { config } from "dotenv";
import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach } from "vitest";
import { createDb } from "../../src/db/index.js";

// fail closed: tests truncate tables, so never fall back to the dev DATABASE_URL
const loaded = config({
  path: path.resolve(import.meta.dirname, "../../../../.env.test"),
  override: true,
});
if (loaded.error)
  throw new Error(
    ".env.test not found at repo root — refusing to run destructive test setup",
  );
const testUrl = process.env.DATABASE_URL;
const dbName = testUrl ? new URL(testUrl).pathname.replace(/^\//, "") : "";
if (!/(^test_|_test$)/i.test(dbName)) {
  throw new Error(
    `DATABASE_URL in .env.test must point to a database named test_* or *_test (got "${dbName}")`,
  );
}
process.env.JWT_SECRET = "test-only-jwt-secret-at-least-32-characters";

export const db = createDb(testUrl!);
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
// the truncation that runs before every test.
let itemCodeCounter = 0;
export const nextTestItemCode = () => (itemCodeCounter += 1);

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
  });
});

beforeEach(async () => {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  await db.execute(sql`TRUNCATE TABLE expenses`);
  await db.execute(sql`TRUNCATE TABLE expense_categories`);
  await db.execute(sql`TRUNCATE TABLE waste_allocations`);
  await db.execute(sql`TRUNCATE TABLE waste_entries`);
  await db.execute(sql`TRUNCATE TABLE refund_line_allocations`);
  await db.execute(sql`TRUNCATE TABLE refund_lines`);
  await db.execute(sql`TRUNCATE TABLE refunds`);
  await db.execute(sql`TRUNCATE TABLE order_line_allocations`);
  await db.execute(sql`TRUNCATE TABLE order_line_modifiers`);
  await db.execute(sql`TRUNCATE TABLE order_lines`);
  await db.execute(sql`TRUNCATE TABLE orders`);
  await db.execute(sql`TRUNCATE TABLE shift_events`);
  await db.execute(sql`TRUNCATE TABLE shifts`);
  await db.execute(sql`TRUNCATE TABLE preparation_allocations`);
  await db.execute(sql`TRUNCATE TABLE preparations`);
  await db.execute(sql`TRUNCATE TABLE recipe_ingredients`);
  await db.execute(sql`TRUNCATE TABLE recipe_sizes`);
  await db.execute(sql`TRUNCATE TABLE recipes`);
  await db.execute(sql`TRUNCATE TABLE transfer_lines`);
  await db.execute(sql`TRUNCATE TABLE transfers`);
  await db.execute(sql`TRUNCATE TABLE transfer_request_lines`);
  await db.execute(sql`TRUNCATE TABLE transfer_requests`);
  await db.execute(sql`TRUNCATE TABLE purchase_lines`);
  await db.execute(sql`TRUNCATE TABLE purchase_invoices`);
  await db.execute(sql`TRUNCATE TABLE stock_deficit_allocations`);
  await db.execute(sql`TRUNCATE TABLE stock_movements`);
  await db.execute(sql`TRUNCATE TABLE stock_batches`);
  await db.execute(sql`TRUNCATE TABLE external_modifier_ingredients`);
  await db.execute(sql`TRUNCATE TABLE external_size_ingredients`);
  await db.execute(sql`TRUNCATE TABLE external_product_ingredients`);
  await db.execute(sql`TRUNCATE TABLE external_modifier_options`);
  await db.execute(sql`TRUNCATE TABLE external_modifier_groups`);
  await db.execute(sql`TRUNCATE TABLE external_product_sizes`);
  await db.execute(sql`TRUNCATE TABLE external_products`);
  await db.execute(sql`TRUNCATE TABLE external_categories`);
  await db.execute(sql`TRUNCATE TABLE external_catalog_sync`);
  await db.execute(sql`TRUNCATE TABLE external_orders_cache`);
  await db.execute(sql`TRUNCATE TABLE items`);
  await db.execute(sql`TRUNCATE TABLE supplier_payments`);
  await db.execute(sql`TRUNCATE TABLE suppliers`);
  await db.execute(sql`TRUNCATE TABLE categories`);
  await db.execute(sql`TRUNCATE TABLE users`);
  await db.execute(sql`TRUNCATE TABLE employees`);
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
});
