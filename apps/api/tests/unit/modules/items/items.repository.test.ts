import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "../../../../src/db/index.js";
import * as schema from "../../../../src/db/schema.js";
import { ItemsRepository } from "../../../../src/modules/items/items.repository.js";

function recordingDb() {
  const statements: string[] = [];
  const db = drizzle(
    async (sql) => {
      statements.push(sql);
      return { rows: [] };
    },
    { schema, mode: "default" },
  ) as unknown as Db;
  return { db, statements };
}

describe("ItemsRepository code allocation", () => {
  it("locks the items it reads the next code from", async () => {
    const { db, statements } = recordingDb();

    await new ItemsRepository(db).nextItemCode();

    const generated = statements.join("\n").toLowerCase();
    // without the lock, a concurrent create inside REPEATABLE READ would read
    // the same snapshot and hand out a code that is already taken
    expect(generated).toContain("max(`code`)");
    expect(generated).toMatch(/for update\s*$/);
  });
});
