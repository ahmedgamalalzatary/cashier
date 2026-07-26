import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "../../../src/db/index.js";
import * as schema from "../../../src/db/schema.js";
import { ItemsRepository } from "../../../src/modules/items/items.repository.js";
import { OrdersRepository } from "../../../src/modules/orders/orders.repository.js";
import { PurchasesRepository } from "../../../src/modules/purchases/purchases.repository.js";
import { RecipesRepository } from "../../../src/modules/recipes/recipes.repository.js";
import { TransfersRepository } from "../../../src/modules/transfers/transfers.repository.js";

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
      (db: Db) => new PurchasesRepository(db).listLines(1),
    ],
    [
      "transfer request lines",
      (db: Db) => new TransfersRepository(db).listRequestLines(1),
    ],
    [
      "transfer lines",
      (db: Db) => new TransfersRepository(db).listTransferLines(1),
    ],
    [
      "recipe ingredients",
      (db: Db) => new RecipesRepository(db).listIngredients(1),
    ],
    [
      "preparation allocations",
      (db: Db) => new RecipesRepository(db).listPreparationAllocations(1),
    ],
    [
      "order line allocations",
      (db: Db) => new OrdersRepository(db).listAllocations([1]),
    ],
    ["the item list", (db: Db) => new ItemsRepository(db).list()],
  ])("selects the item code for %s", async (_label, run) => {
    const { db, statements } = recordingDb();

    await run(db);

    expect(statements.join(" ").toLowerCase()).toContain("`items`.`code`");
  });
});
