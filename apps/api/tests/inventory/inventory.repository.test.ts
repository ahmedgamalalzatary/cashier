import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@cashier/db";
import * as schema from "@cashier/db";
import { InventoryRepository } from "../../src/modules/inventory/inventory.repository.js";
import { withBranch } from "@cashier/db";

function proxyDb() {
  return drizzle(async () => ({ rows: [] }), {
    schema,
    mode: "default",
  }) as unknown as Db;
}

describe("InventoryRepository stock rows", () => {
  it("exposes the item code so the warehouse can label rows", () => {
    const generated = new InventoryRepository(proxyDb())
      .listStock("main")
      .toSQL()
      .sql.toLowerCase();

    expect(generated).toContain("`items`.`code`");
  });
});

describe("InventoryRepository deficit locking", () => {
  it("locks the outer stock movement rows while retaining the allocation subquery", () => {
    const db = drizzle(async () => ({ rows: [] }), {
      schema,
      mode: "default",
    }) as unknown as Db;
    const query = withBranch(23, () =>
      new InventoryRepository(db).outstandingDeficits(7, "main"),
    );
    const generated = query.toSQL().sql.toLowerCase();

    expect(generated).toContain("from `stock_movements`");
    expect(generated).toContain(
      "from (select * from `stock_deficit_allocations` where branch_id=?) sda",
    );
    expect(query.toSQL().params).toEqual([23, 23, 7, "main", "0", 23]);
    expect(generated).toMatch(/for update\s*$/);
  });
});
