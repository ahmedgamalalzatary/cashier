import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTestEnvironment } from "./support/test-env.js";

const dirs: string[] = [];

function envFile(database: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "cashier-test-env-"));
  dirs.push(dir);
  const file = path.join(dir, ".env.test");
  writeFileSync(
    file,
    `DATABASE_URL=mysql://tester:password@localhost:3306/${database}\n`,
  );
  vi.stubEnv("DATABASE_URL", "");
  return file;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("test database isolation", () => {
  it("uses the configured DB database by default", () => {
    expect(
      new URL(loadTestEnvironment({ envFile: envFile("cashier_test") }))
        .pathname,
    ).toBe("/cashier_test");
  });

  it("uses a separate API database with the same connection credentials", () => {
    expect(
      loadTestEnvironment({
        envFile: envFile("cashier_test"),
        databaseName: "cashier_api_test",
      }),
    ).toBe("mysql://tester:password@localhost:3306/cashier_api_test");
  });

  it("rejects a production database even when an API test database is requested", () => {
    expect(() =>
      loadTestEnvironment({
        envFile: envFile("cashier"),
        databaseName: "cashier_api_test",
      }),
    ).toThrow("test_* or *_test");
  });

  it.each(["cashier", "cashier_test_api", "cashier_test/production"])(
    "rejects unsafe override %s",
    (databaseName) => {
      expect(() =>
        loadTestEnvironment({ envFile: envFile("cashier_test"), databaseName }),
      ).toThrow("test_* or *_test");
    },
  );
});
