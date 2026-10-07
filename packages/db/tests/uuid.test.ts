import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "../src/index.js";
import { mysqlTable } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import { id } from "../src/uuid.js";

// Exercise the public ID generator: schema defaults and repository inserts must
// share one generator, including when several records are created in one millisecond.
const generate = () =>
  (db as unknown as { uuidv7?: () => string }).uuidv7?.();

afterEach(() => vi.restoreAllMocks());

describe("database UUIDs", () => {
  it("generates canonical version 7 IDs", () => {
    expect(generate()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("keeps IDs unique and ordered within the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const ids = Array.from({ length: 1_000 }, generate);
    expect(new Set(ids).size).toBe(1_000);
    expect(ids).toEqual([...ids].sort());
  });

  it("keeps later IDs ordered when the system clock moves backwards", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_001_000);
    const first = generate();
    now.mockReturnValue(1_800_000_000_000);
    const second = generate();
    expect(second! > first!).toBe(true);
  });
});

describe("UUID column defaults", () => {
  it("generates an ID before an insert and preserves an explicit ID", () => {
    const table = mysqlTable("uuid_insert_test", { id: id().primaryKey() });
    const database = drizzle.mock();
    const first = database.insert(table).values({}).toSQL().params[0];
    const second = database.insert(table).values({}).toSQL().params[0];
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
    const explicit = "019a1234-5678-7000-8000-000000000001";
    expect(database.insert(table).values({ id: explicit }).toSQL().params).toEqual([explicit]);
  });
  it("stores IDs with the exact ASCII binary SQL type", () => {
    const column = (db as unknown as {
      id?: (name: string) => { build: (table: unknown) => { getSQLType: () => string } };
    }).id?.("id");
    expect(column?.build(mysqlTable("uuid_type_test", {})).getSQLType()).toBe(
      "char(36) CHARACTER SET ascii COLLATE ascii_bin",
    );
  });
});
