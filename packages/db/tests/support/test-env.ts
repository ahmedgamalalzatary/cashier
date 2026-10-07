import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { config } from "dotenv";
import { closeDb, createDb } from "../../src/client.js";

/** The migrations that belong to this package's schema. */
export const migrationsFolder = path.resolve(
  import.meta.dirname,
  "../../drizzle",
);

/** Applies every pending migration to the test database. */
export async function migrateTestDatabase() {
  const db = createDb(loadTestEnvironment());
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await closeDb(db);
  }
}

export function loadTestEnvironment() {
  const loaded = config({
    path: path.resolve(import.meta.dirname, "../../../../.env.test"),
    override: true,
  });
  if (loaded.error) {
    throw new Error(
      ".env.test not found at repo root \u2014 refusing to run destructive test setup",
    );
  }

  const testUrl = process.env.DATABASE_URL;
  const dbName = testUrl ? new URL(testUrl).pathname.replace(/^\//, "") : "";
  if (!/(^test_|_test$)/i.test(dbName)) {
    throw new Error(
      `DATABASE_URL in .env.test must point to a database named test_* or *_test (got "${dbName}")`,
    );
  }

  return testUrl!;
}
