import { repositoryIt as it } from "@cashier/db/test-support/ids";
import { testId } from "@cashier/shared/test-support";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect } from "vitest";
import type { Db } from "@cashier/db";
import * as schema from "@cashier/db";
import { ItemsRepository } from "../../src/modules/items/items.repository.js";
import { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";
import { RecipesRepository } from "../../src/modules/recipes/recipes.repository.js";
import { TransfersRepository } from "../../src/modules/transfers/transfers.repository.js";

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

// every document that names an item must also carry its code
describe("item code projections", () => {
  it.each([
    [
      "purchase invoice lines",
      (db: Db) => new PurchasesRepository(db).listLines(testId(1)),
    ],
    [
      "transfer request lines",
      (db: Db) => new TransfersRepository(db).listRequestLines(testId(1)),
    ],
    [
      "transfer lines",
      (db: Db) => new TransfersRepository(db).listTransferLines(testId(1)),
    ],
    [
      "recipe ingredients",
      (db: Db) => new RecipesRepository(db).listIngredients(testId(1)),
    ],
    [
      "preparation allocations",
      (db: Db) => new RecipesRepository(db).listPreparationAllocations(testId(1)),
    ],
    [
      "order line allocations",
      (db: Db) => new OrdersRepository(db).listAllocations([testId(1)]),
    ],
    ["the item list", (db: Db) => new ItemsRepository(db).list()],
  ])("selects the item code for %s", async (_label, run) => {
    const { db, statements } = recordingDb();

    await run(db);

    const selectList = statements
      .map((sql) => {
        const match = sql.match(/select\s+([\s\S]*?)\s+from\s/i);
        return match?.[1] ?? "";
      })
      .join(" ")
      .toLowerCase();
    expect(selectList).toContain("`items`.`code`");
  });
});
