import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { closeDb, createDb } from "../src/db/index.js";
import { loadTestEnvironment } from "./test-env.js";

export default async function setup() {
  const db = createDb(loadTestEnvironment());

  try {
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
    });
  } finally {
    await closeDb(db);
  }
}
