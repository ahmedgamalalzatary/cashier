import { config } from 'dotenv';
import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach } from 'vitest';
import { createDb } from '../src/db/index.js';

config({ path: path.resolve(import.meta.dirname, '../../../.env.test'), override: true });

export const db = createDb(process.env.DATABASE_URL!);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  await db.execute(sql`TRUNCATE TABLE supplier_payments`);
  await db.execute(sql`TRUNCATE TABLE suppliers`);
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
});
