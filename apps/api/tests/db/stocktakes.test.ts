import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { categories, items, stockMovements } from "../../src/db/schema.js";
import { InventoryRepository } from "../../src/modules/inventory/inventory.repository.js";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { StocktakesRepository } from "../../src/modules/stocktakes/stocktakes.repository.js";
import { appOptions, db, nextTestItemCode } from "../setup.js";
import { loginAs } from "../helpers.js";

describe("stocktake API", () => {
  it("confirms FIFO shortages and single-item surplus adjustments", async () => {
    const app = createApp(db, appOptions);
    const authorization = await loginAs(app, "admin");
    const [category] = await db.insert(categories).values({ name: "خامات" });
    const [item] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    await new InventoryService(new InventoryRepository(db)).receive({
      itemId: item.insertId,
      warehouse: "main",
      quantity: 5,
      unitCost: "10",
      movementType: "purchase",
    });

    const started = await request(app)
      .post("/api/stocktakes")
      .set(authorization)
      .send({ warehouse: "main" });
    expect(started.status).toBe(201);
    expect(started.body.lines[0]).toMatchObject({ recordedQuantity: "5.000" });

    await request(app)
      .put(`/api/stocktakes/${started.body.id}/counts`)
      .set(authorization)
      .send({ lines: [{ itemId: item.insertId, countedQuantity: 3 }] })
      .expect(200);
    await request(app)
      .post(`/api/stocktakes/${started.body.id}/confirm`)
      .set(authorization)
      .send({ note: "جرد شهري" })
      .expect(200);

    await request(app)
      .post("/api/stocktakes/manual-adjustments")
      .set(authorization)
      .send({
        warehouse: "main",
        itemId: item.insertId,
        countedQuantity: 4,
        note: "إعادة عد",
      })
      .expect(201);

    const stock = await request(app)
      .get("/api/inventory/main/stock")
      .set(authorization);
    expect(stock.body[0].quantity).toBe("4.000");
    const movements = await db.select().from(stockMovements);
    expect(movements.map((row) => row.movementType)).toEqual([
      "purchase",
      "stocktake_shortage",
      "stocktake_surplus",
    ]);
    expect(movements[2]?.unitCost).toBe("10.000000");
  });

  it("rejects confirmation when stock changed after the snapshot", async () => {
    const app = createApp(db, appOptions);
    const authorization = await loginAs(app, "admin");
    const [category] = await db.insert(categories).values({ name: "خامات" });
    const [item] = await db
      .insert(items)
      .values({
        code: nextTestItemCode(),
        name: "لبن",
        categoryId: category.insertId,
        type: "raw",
        stockUnit: "لتر",
      });
    const inventory = new InventoryService(new InventoryRepository(db));
    const started = await request(app)
      .post("/api/stocktakes")
      .set(authorization)
      .send({ warehouse: "main" });
    await request(app)
      .put(`/api/stocktakes/${started.body.id}/counts`)
      .set(authorization)
      .send({ lines: [{ itemId: item.insertId, countedQuantity: 0 }] });
    await inventory.receive({
      itemId: item.insertId,
      warehouse: "main",
      quantity: 1,
      unitCost: "4",
      movementType: "purchase",
    });
    const response = await request(app)
      .post(`/api/stocktakes/${started.body.id}/confirm`)
      .set(authorization)
      .send({ note: "جرد" });
    expect(response.status).toBe(409);
  });
});

describe("stocktake snapshot", () => {
  it("excludes inactive items when snapshotting all items", async () => {
    const [category] = await db.insert(categories).values({ name: "خامات" });
    const [active] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    await db.insert(items).values({
      code: nextTestItemCode(),
      name: "شاي",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
      isActive: false,
    });
    const repo = new StocktakesRepository(db);

    const rows = await repo.snapshotItems("main", null);

    expect(rows.map((row) => row.itemId)).toEqual([active.insertId]);
  });

  it("excludes inactive items when snapshotting a category", async () => {
    const [category] = await db.insert(categories).values({ name: "خامات" });
    const [child] = await db
      .insert(categories)
      .values({ name: "مشروبات", parentId: category.insertId });
    const [inCategory] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    await db.insert(items).values({
      code: nextTestItemCode(),
      name: "شاي",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
      isActive: false,
    });
    const [inChild] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "لبن",
      categoryId: child.insertId,
      type: "raw",
      stockUnit: "لتر",
    });
    const repo = new StocktakesRepository(db);

    const rows = await repo.snapshotItems("main", category.insertId);

    expect(rows.map((row) => row.itemId)).toEqual([
      inCategory.insertId,
      inChild.insertId,
    ]);
  });
});
