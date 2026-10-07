import { repositoryIt as it } from "@cashier/db/test-support/ids";
import { testId } from "@cashier/shared/test-support";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect } from "vitest";
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
    const query = withBranch(testId(23), () =>
      new InventoryRepository(db).outstandingDeficits(testId(7), "main"),
    );
    const generated = query.toSQL().sql.toLowerCase();

    expect(generated).toContain("from `stock_movements`");
    expect(generated).toContain(
      "from (select * from `stock_deficit_allocations` where branch_id=?) sda",
    );
    expect(query.toSQL().params).toEqual([testId(23), testId(23), testId(7), "main", "0", testId(23)]);
    expect(generated).toMatch(/for update\s*$/);
  });
});
