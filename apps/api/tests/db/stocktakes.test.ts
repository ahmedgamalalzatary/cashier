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
    const [item] = await db.insert(items).values({
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

  it.each([
    {
      receiptOrder: "different receipt times",
      receipts: [
        { unitCost: "17.75", occurredAt: new Date("2026-09-02T10:00:00Z") },
        { unitCost: "12.50", occurredAt: new Date("2026-09-01T10:00:00Z") },
      ],
      expectedCost: "17.750000",
    },
    {
      receiptOrder: "equal receipt times",
      receipts: [
        { unitCost: "12.50", occurredAt: new Date("2026-09-02T10:00:00Z") },
        { unitCost: "18.25", occurredAt: new Date("2026-09-02T10:00:00Z") },
      ],
      expectedCost: "18.250000",
    },
  ])(
    "values empty-shelf surplus at the newest cost with $receiptOrder",
    async ({ receipts, expectedCost }) => {
      const app = createApp(db, appOptions);
      const authorization = await loginAs(app, "admin");
      const [category] = await db.insert(categories).values({ name: "خامات" });
      const [item] = await db.insert(items).values({
        code: nextTestItemCode(),
        name: "سكر",
        categoryId: category.insertId,
        type: "raw",
        stockUnit: "كجم",
      });
      const inventory = new InventoryService(new InventoryRepository(db));
      for (const receipt of receipts) {
        await inventory.receive({
          itemId: item.insertId,
          warehouse: "main",
          quantity: 2,
          movementType: "purchase",
          ...receipt,
        });
      }
      // Empty both batches; receipt time and then ID determine the latest cost.
      await inventory.consume({
        itemId: item.insertId,
        warehouse: "main",
        quantity: 4,
        movementType: "waste",
      });

      await request(app)
        .post("/api/stocktakes/manual-adjustments")
        .set(authorization)
        .send({
          warehouse: "main",
          itemId: item.insertId,
          countedQuantity: 3,
          note: "جرد اكتشاف زيادة",
        })
        .expect(201);

      const movements = await db.select().from(stockMovements);
      const surplus = movements.at(-1);
      expect(surplus?.movementType).toBe("stocktake_surplus");
      expect(surplus?.unitCost).toBe(expectedCost);
    },
  );

  it("still values surplus from a stocked shelf at the oldest batch cost", async () => {
    const app = createApp(db, appOptions);
    const authorization = await loginAs(app, "admin");
    const [category] = await db.insert(categories).values({ name: "خامات" });
    const [item] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "شاي",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    const inventory = new InventoryService(new InventoryRepository(db));
    await inventory.receive({
      itemId: item.insertId,
      warehouse: "main",
      quantity: 5,
      unitCost: "20",
      movementType: "purchase",
    });
    await inventory.receive({
      itemId: item.insertId,
      warehouse: "main",
      quantity: 5,
      unitCost: "30",
      movementType: "purchase",
    });

    await request(app)
      .post("/api/stocktakes/manual-adjustments")
      .set(authorization)
      .send({
        warehouse: "main",
        itemId: item.insertId,
        countedQuantity: 11,
        note: "جرد زيادة",
      })
      .expect(201);

    const movements = await db.select().from(stockMovements);
    const surplus = movements.at(-1);
    expect(surplus?.movementType).toBe("stocktake_surplus");
    // FIFO means the oldest batch still holding stock values the surplus.
    expect(surplus?.unitCost).toBe("20.000000");
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
