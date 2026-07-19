import { config } from 'dotenv';
import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach } from 'vitest';
import { createDb } from '../src/db/index.js';

// fail closed: tests truncate tables, so never fall back to the dev DATABASE_URL
const loaded = config({
  path: path.resolve(import.meta.dirname, '../../../.env.test'),
  override: true,
});
if (loaded.error)
  throw new Error(
    '.env.test not found at repo root — refusing to run destructive test setup',
  );
const testUrl = process.env.DATABASE_URL;
const dbName = testUrl ? new URL(testUrl).pathname.replace(/^\//, '') : '';
if (!/(^test_|_test$)/i.test(dbName)) {
  throw new Error(
    `DATABASE_URL in .env.test must point to a database named test_* or *_test (got "${dbName}")`,
  );
}
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-characters';

export const db = createDb(testUrl!);
export const appOptions = {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: 'http://localhost:3000',
};

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../drizzle'),
  });
});

beforeEach(async () => {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  await db.execute(sql`TRUNCATE TABLE supplier_payments`);
  await db.execute(sql`TRUNCATE TABLE suppliers`);
  await db.execute(sql`TRUNCATE TABLE categories`);
  await db.execute(sql`TRUNCATE TABLE users`);
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
});
