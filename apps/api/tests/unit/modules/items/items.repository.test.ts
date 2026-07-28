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
  it("locks product variants while reserving a range of codes", async () => {
    const { db, statements } = recordingDb();
    await new ItemsRepository(db).nextItemCodes(2);
    const generated = statements.join("\n").toLowerCase();
    expect(generated).toContain("product_variants");
    expect(generated).toContain("for update");
  });
});
