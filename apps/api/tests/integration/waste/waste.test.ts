import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../src/app.js";
import {
  categories,
  externalCategories,
  externalProducts,
  externalProductSizes,
  externalSizeIngredients,
  items,
  stockBatches,
  stockMovements,
  wasteEntries,
} from "../../../src/db/schema.js";
import { appOptions, db, nextTestItemCode } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let cashierAuth: { readonly Authorization: string };

async function stockItem(
  warehouse: "main" | "cafe",
  quantities = ["2.000", "3.000"],
) {
  const [category] = await db.insert(categories).values({ name: "خامات" });
  const [item] = await db.insert(items).values({
    code: nextTestItemCode(),
    name: "لبن",
    categoryId: category.insertId,
    type: "raw",
    stockUnit: "لتر",
  });
  for (const [index, quantity] of quantities.entries()) {
    await db.insert(stockBatches).values({
      itemId: item.insertId,
      warehouse,
      initialQuantity: quantity,
      remainingQuantity: quantity,
      unitCost: index === 0 ? "2.000000" : "3.000000",
      receivedAt: new Date(Date.now() + index),
      sourceType: "purchase",
    });
  }
  return item.insertId;
}

beforeEach(async () => {
  cashierAuth = await loginAs(app(), "cashier");
  await request(app())
    .post("/api/shifts/open")
    .set(cashierAuth)
    .send({ openingFloat: 100 });
});

describe("waste", () => {
  it("records cafe item waste with exact FIFO allocations and shift count", async () => {
    const itemId = await stockItem("cafe");
    const response = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "cafe",
        target: { type: "item", itemId },
        quantity: 4,
        reason: "damaged",
        note: "تلف أثناء الوردية",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      warehouse: "cafe",
      targetType: "item",
      targetName: "لبن",
      quantity: "4.000",
      reason: "damaged",
      totalCost: "10.00",
    });
    expect(response.body.allocations).toEqual([
      expect.objectContaining({ quantity: "2.000", unitCost: "2.000000" }),
      expect.objectContaining({ quantity: "2.000", unitCost: "3.000000" }),
    ]);
    const shift = await request(app())
      .get("/api/shifts/current")
      .set(cashierAuth);
    expect(shift.body.totals.wasteEntries).toBe(1);
  });

  it("replays the same client request without another stock deduction", async () => {
    const itemId = await stockItem("cafe");
    const body = {
      clientRequestId: crypto.randomUUID(),
      warehouse: "cafe",
      target: { type: "item", itemId },
      quantity: 1,
      reason: "damaged",
      note: null,
    };
    const first = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send(body);
    const replay = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send(body);

    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.referenceType, "waste")),
    ).toHaveLength(1);
  });

  it("blocks cashier main-warehouse waste", async () => {
    const itemId = await stockItem("main");
    const response = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "main",
        target: { type: "item", itemId },
        quantity: 1,
        reason: "expired",
        note: null,
      });
    expect(response.status).toBe(403);
  });

  it("allows admin main-warehouse waste without a shift", async () => {
    const adminAuth = await loginAs(app(), "admin");
    const itemId = await stockItem("main");
    const response = await request(app())
      .post("/api/waste")
      .set(adminAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "main",
        target: { type: "item", itemId },
        quantity: 1,
        reason: "expired",
        note: null,
      });
    expect(response.status).toBe(201);
    expect(response.body.shiftId).toBeNull();
  });

  it("rolls back an item waste entry when stock is insufficient", async () => {
    const itemId = await stockItem("cafe", ["1.000"]);
    const response = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "cafe",
        target: { type: "item", itemId },
        quantity: 2,
        reason: "spill",
        note: null,
      });
    expect(response.status).toBe(409);
    expect(
      await db
        .select()
        .from(wasteEntries)
        .where(eq(wasteEntries.itemId, itemId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.referenceType, "waste")),
    ).toHaveLength(0);
  });

  it("records external-product waste by consuming its configured cafe ingredients", async () => {
    const itemId = await stockItem("cafe");
    const syncedAt = new Date();
    await db.insert(externalCategories).values({
      externalId: 3,
      nameAr: "مشروبات",
      nameEn: "Drinks",
      descriptionAr: null,
      descriptionEn: null,
      isActive: true,
      isVisible: true,
      displayOrder: 1,
      isCurrent: true,
      syncedAt,
    });
    await db.insert(externalProducts).values({
      externalId: 9,
      externalCategoryId: 3,
      nameAr: "لاتيه",
      nameEn: "Latte",
      descriptionAr: null,
      descriptionEn: null,
      imageUrl: null,
      price: "30.00",
      discountPercentage: null,
      discountStart: null,
      discountEnd: null,
      calories: 100,
      pointsReward: 3,
      isAvailable: true,
      isVisible: true,
      isCurrent: true,
      syncedAt,
    });
    await db.insert(externalProductSizes).values({
      externalId: 91,
      externalProductId: 9,
      nameAr: "كبير",
      nameEn: "Large",
      price: "30.00",
      isDefault: true,
      isCurrent: true,
      syncedAt,
    });
    await db.insert(externalSizeIngredients).values({
      externalSizeId: 91,
      itemId,
      quantity: "0.500",
    });

    const response = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "cafe",
        target: {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: 91,
        },
        quantity: 2,
        reason: "spill",
        note: null,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      targetType: "external_product",
      targetName: "لاتيه",
      sizeName: "كبير",
      quantity: "2.000",
      totalCost: "2.00",
      allocations: [
        expect.objectContaining({
          itemName: "لبن",
          quantity: "1.000",
          unitCost: "2.000000",
        }),
      ],
    });
  });
});
