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
export async function migrateTestDatabase(databaseName?: string) {
  const db = createDb(loadTestEnvironment({ databaseName }));
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await closeDb(db);
  }
}

export function loadTestEnvironment({
  envFile = path.resolve(import.meta.dirname, "../../../../.env.test"),
  databaseName = process.env.CASHIER_TEST_DATABASE_NAME,
}: { envFile?: string; databaseName?: string } = {}) {
  const loaded = config({
    path: envFile,
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

  if (!databaseName) return testUrl!;
  if (
    !/^[a-z0-9_]+$/i.test(databaseName) ||
    !/(^test_|_test$)/i.test(databaseName)
  ) {
    throw new Error("Test database override must be named test_* or *_test");
  }
  const url = new URL(testUrl!);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
