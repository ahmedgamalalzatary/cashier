import mysql from "mysql2/promise";
import { createDb } from "../../src/client.js";
import { loadTestEnvironment, migrateTestDatabase } from "./test-env.js";

/**
 * Extra databases for tests that need a PC or online database of their own.
 * Building one from scratch takes ~25s of migrations, so they are kept
 * between runs like the main test database: global setup only applies new
 * migrations, and each user empties them before use.
 */
export const scratchDatabases = [
  "cashier_scratch_a_test",
  "cashier_scratch_b_test",
] as const;

/** Global setup: every scratch database exists and is fully migrated. */
export async function prepareScratchDatabases() {
  const owner = await mysql.createConnection(loadTestEnvironment());
  try {
    for (const name of scratchDatabases)
      await owner.query(
        "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4",
        [name],
      );
  } finally {
    await owner.end();
  }
  await Promise.all(scratchDatabases.map((name) => migrateTestDatabase(name)));
}

/**
 * Returns a scratch database to just-migrated: every table but the migration
 * log is truncated, which also resets auto-increment counters and fires no
 * triggers.
 */
export async function emptyScratchDatabase(
  name: (typeof scratchDatabases)[number],
) {
  const owner = await mysql.createConnection(loadTestEnvironment());
  try {
    const [rows] = await owner.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         AND TABLE_NAME <> '__drizzle_migrations'`,
      [name],
    );
    await owner.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name: table } of rows)
      await owner.query("TRUNCATE TABLE ??.??", [name, table]);
  } finally {
    await owner.end();
  }
}

/** An emptied scratch database, opened. */
export async function openScratchDatabase(
  name: (typeof scratchDatabases)[number],
) {
  await emptyScratchDatabase(name);
  const url = loadTestEnvironment({ databaseName: name });
  return { db: createDb(url), url };
}
