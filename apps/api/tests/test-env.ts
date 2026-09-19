import { config } from "dotenv";
import path from "node:path";

export function loadTestEnvironment() {
  const loaded = config({
    path: path.resolve(import.meta.dirname, "../../../.env.test"),
    override: true,
  });
  if (loaded.error) {
    throw new Error(
      ".env.test not found at repo root — refusing to run destructive test setup",
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
