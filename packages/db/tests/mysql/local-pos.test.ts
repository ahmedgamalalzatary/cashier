import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  branches,
  categories,
  externalCategories,
  externalProductIngredients,
  externalProducts,
  items,
  orders,
  stockBatches,
  stockMovements,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = createApp(db, appOptions);
let cashier: { readonly Authorization: string };

beforeEach(async () => {
  cashier = await loginAs(app, "cashier");
  await request(app)
    .post("/api/shifts/open")
    .set(cashier)
    .send({ openingFloat: 0 })
    .expect(201);
});

async function fixture() {
  const [main] = await db.insert(categories).values({ name: "مشروبات" });
  const [sub] = await db
    .insert(categories)
    .values({ name: "قهوة", parentId: main.insertId });
  const [item] = await db
    .insert(items)
    .values({
      code: nextTestItemCode(),
      name: "تركي سنجل",
      categoryId: sub.insertId,
      type: "resale",
      stockUnit: "فنجان",
      sellingPrice: "35.00",
    });
  for (const [quantity, cost, date] of [
    [1, 3, "2026-09-01"],
    [10, 5, "2026-09-02"],
  ] as const) {
    const [batch] = await db
      .insert(stockBatches)
      .values({
        itemId: item.insertId,
        warehouse: "cafe",
        initialQuantity: quantity.toFixed(3),
        remainingQuantity: quantity.toFixed(3),
        unitCost: cost.toFixed(6),
        receivedAt: new Date(date),
        sourceType: "transfer_in",
      });
    await db
      .insert(stockMovements)
      .values({
        itemId: item.insertId,
        warehouse: "cafe",
        batchId: batch.insertId,
        movementType: "transfer_in",
        quantity: quantity.toFixed(3),
        unitCost: cost.toFixed(6),
        occurredAt: new Date(date),
      });
  }
  return { id: item.insertId, mainId: main.insertId, subId: sub.insertId };
}

const body = (itemId: number, quantity = 2) => ({
  clientRequestId: randomUUID(),
  lines: [{ type: "item", itemId, quantity }],
  discount: { type: "fixed", value: 5 },
  cashReceived: 100,
});

describe("local resale POS", () => {
  it("lists priced resale items and their category tree for cashiers without an external cache", async () => {
    const f = await fixture();
    const [other] = await db.insert(branches).values({ name: "Other" });
    const [foreignCategory] = await db
      .insert(categories)
      .values({ branchId: other.insertId, name: "Other" });
    await db
      .insert(items)
      .values({
        branchId: other.insertId,
        code: nextTestItemCode(),
        name: "Foreign",
        categoryId: foreignCategory.insertId,
        type: "resale",
        sellingPrice: "99.00",
        stockUnit: "قطعة",
      });
    await db
      .insert(items)
      .values({
        code: nextTestItemCode(),
        name: "Ingredient",
        categoryId: f.subId,
        type: "raw",
        stockUnit: "جم",
      });
    const response = await request(app)
      .get("/api/products/local")
      .set(cashier)
      .expect(200);
    expect(response.body.products).toEqual([
      {
        id: f.id,
        name: "تركي سنجل",
        categoryId: f.subId,
        sellingPrice: "35.00",
        stockUnit: "فنجان",
      },
    ]);
    expect(response.body.categories).toEqual(
      expect.arrayContaining([
        { id: f.mainId, name: "مشروبات", parentId: null },
        { id: f.subId, name: "قهوة", parentId: f.mainId },
      ]),
    );
    await request(app).get("/api/products/local").expect(401);
    const pos = await request(app)
      .get("/api/products?all=true&pos=true")
      .set(cashier)
      .expect(200);
    expect(pos.body).toMatchObject({
      products: [],
      localProducts: [{ id: f.id, sellingPrice: "35.00" }],
      localCategories: [{ id: f.mainId }, { id: f.subId }],
    });
  });

  it("sells without a recipe at the server price, consumes FIFO cafe stock, and replays without another deduction", async () => {
    const f = await fixture();
    const input = body(f.id);
    const response = await request(app)
      .post("/api/orders")
      .set(cashier)
      .send(input)
      .expect(201);
    expect(response.body).toMatchObject({
      subtotal: "70.00",
      total: "65.00",
      changeAmount: "35.00",
      totalCost: "8.00",
      isNegativeStock: false,
      lines: [
        {
          type: "item",
          itemId: f.id,
          recipeId: null,
          productName: "تركي سنجل",
          unitPrice: "35.00",
          quantity: "2.000",
          totalCost: "8.00",
          modifiers: [],
        },
      ],
    });
    expect(
      response.body.lines[0].allocations.map(
        (row: { quantity: string; unitCost: string }) => [
          row.quantity,
          row.unitCost,
        ],
      ),
    ).toEqual([
      ["1.000", "3.000000"],
      ["1.000", "5.000000"],
    ]);
    const replay = await request(app)
      .post("/api/orders")
      .set(cashier)
      .send({
        ...input,
        lines: [
          { type: "item", itemId: f.id, quantity: 1 },
          { type: "item", itemId: f.id, quantity: 1 },
        ],
      })
      .expect(201);
    expect(replay.body.id).toBe(response.body.id);
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "sale"));
    expect(movements.map((row) => [row.warehouse, row.quantity])).toEqual([
      ["cafe", "-1.000"],
      ["cafe", "-1.000"],
    ]);
  });

  it("returns sold units at their original FIFO cost even after the item price changes", async () => {
    const f = await fixture();
    const sale = await request(app)
      .post("/api/orders")
      .set(cashier)
      .send(body(f.id))
      .expect(201);
    await db
      .update(items)
      .set({ sellingPrice: "99.00" })
      .where(eq(items.id, f.id));
    const refund = await request(app)
      .post("/api/refunds")
      .set(cashier)
      .send({
        clientRequestId: randomUUID(),
        orderId: sale.body.id,
        reason: "إرجاع",
        lines: [
          {
            orderLineId: sale.body.lines[0].id,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      })
      .expect(201);
    expect(refund.body).toMatchObject({
      amount: "32.50",
      totalCostReturned: "3.00",
    });
    const returns = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "refund_return"));
    expect(
      returns.map((row) => [
        row.itemId,
        row.warehouse,
        row.quantity,
        row.unitCost,
      ]),
    ).toEqual([[f.id, "cafe", "1.000", "3.000000"]]);
  });

  it("keeps local and imported identities separate in a mixed order and consumes their shared stock", async () => {
    const f = await fixture();
    const now = new Date();
    await db
      .insert(externalCategories)
      .values({
        externalId: 1,
        nameAr: "خارجي",
        nameEn: "External",
        descriptionAr: null,
        descriptionEn: null,
        isActive: true,
        isVisible: true,
        displayOrder: 1,
        isCurrent: true,
        syncedAt: now,
      });
    await db
      .insert(externalProducts)
      .values({
        externalId: f.id,
        externalCategoryId: 1,
        nameAr: "منتج خارجي",
        nameEn: "External product",
        descriptionAr: null,
        descriptionEn: null,
        imageUrl: null,
        price: "20.00",
        discountPercentage: null,
        discountStart: null,
        discountEnd: null,
        calories: 0,
        pointsReward: 0,
        isAvailable: true,
        isVisible: true,
        isCurrent: true,
        syncedAt: now,
      });
    await db
      .insert(externalProductIngredients)
      .values({ externalProductId: f.id, itemId: f.id, quantity: "1.000" });
    const response = await request(app)
      .post("/api/orders")
      .set(cashier)
      .send({
        ...body(f.id, 1),
        lines: [
          { type: "item", itemId: f.id, quantity: 1 },
          {
            type: "external_product",
            externalProductId: f.id,
            externalSizeId: null,
            quantity: 1,
            modifiers: [],
          },
        ],
      })
      .expect(201);
    expect(response.body).toMatchObject({
      subtotal: "55.00",
      total: "50.00",
      totalCost: "8.00",
      lines: [
        {
          type: "item",
          itemId: f.id,
          externalProductId: null,
          unitPrice: "35.00",
        },
        {
          type: "external_product",
          itemId: null,
          externalProductId: f.id,
          unitPrice: "20.00",
        },
      ],
    });
  });

  it("flags a cafe deficit while leaving main stock untouched", async () => {
    const f = await fixture();
    await db
      .insert(stockBatches)
      .values({
        itemId: f.id,
        warehouse: "main",
        initialQuantity: "100.000",
        remainingQuantity: "100.000",
        unitCost: "0.000000",
        receivedAt: new Date(),
        sourceType: "stocktake_surplus",
      });
    const response = await request(app)
      .post("/api/orders")
      .set(cashier)
      .send({ ...body(f.id, 15), cashReceived: 600 })
      .expect(201);
    expect(response.body).toMatchObject({
      isNegativeStock: true,
      lines: [{ hasStockDeficit: true }],
    });
    const main = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.warehouse, "main"));
    expect(main[0].remainingQuantity).toBe("100.000");
  });

  it("rejects client prices and malformed local selections", async () => {
    const f = await fixture();
    for (const line of [
      { type: "item", itemId: f.id, quantity: 1, sellingPrice: 1 },
      { type: "item", itemId: f.id, quantity: 0 },
      { type: "item", itemId: f.id, quantity: 1.5 },
      { type: "item", itemId: 0, quantity: 1 },
    ]) {
      await request(app)
        .post("/api/orders")
        .set(cashier)
        .send({ ...body(f.id), lines: [line] })
        .expect(400);
    }
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("rejects inactive, raw, unpriced, unknown, and foreign-branch items without saving a sale", async () => {
    const f = await fixture();
    for (const changes of [
      { isActive: false },
      { isActive: true, type: "raw" as const, sellingPrice: null },
      { type: "resale" as const, sellingPrice: null },
    ]) {
      await db.update(items).set(changes).where(eq(items.id, f.id));
      const response = await request(app)
        .post("/api/orders")
        .set(cashier)
        .send(body(f.id));
      expect(response.status).toBe(409);
    }
    await request(app)
      .post("/api/orders")
      .set(cashier)
      .send(body(999999))
      .expect(404);
    const [other] = await db.insert(branches).values({ name: "Other" });
    const [foreignCategory] = await db
      .insert(categories)
      .values({ branchId: other.insertId, name: "Other" });
    const [foreign] = await db
      .insert(items)
      .values({
        branchId: other.insertId,
        code: nextTestItemCode(),
        name: "Foreign",
        categoryId: foreignCategory.insertId,
        type: "resale",
        sellingPrice: "99.00",
        stockUnit: "قطعة",
      });
    await request(app)
      .post("/api/orders")
      .set(cashier)
      .send(body(foreign.insertId))
      .expect(404);
    expect(await db.select().from(orders)).toHaveLength(0);
  });
});
