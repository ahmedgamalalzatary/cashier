import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../src/app.js";
import {
  categories,
  externalCategories,
  externalModifierGroups,
  externalModifierIngredients,
  externalModifierOptions,
  externalProducts,
  externalProductSizes,
  externalSizeIngredients,
  items,
  orders,
  stockBatches,
  stockMovements,
} from "../../../src/db/schema.js";
import { appOptions, db, nextTestItemCode } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let cashierAuthorization: { readonly Authorization: string };
let adminAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  cashierAuthorization = await loginAs(app(), "cashier");
  adminAuthorization = await loginAs(app(), "admin");
  await request(app())
    .post("/api/shifts/open")
    .set(cashierAuthorization)
    .send({ openingFloat: 0 });
});

async function createExternalProductFixture() {
  const now = new Date();
  const [itemCategory] = await db.insert(categories).values({ name: "مخزون" });
  const [ingredient] = await db.insert(items).values({
    code: nextTestItemCode(),
    name: "بن",
    categoryId: itemCategory.insertId,
    type: "raw",
    stockUnit: "كجم",
  });
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
    syncedAt: now,
  });
  await db.insert(externalProducts).values({
    externalId: 9,
    externalCategoryId: 3,
    nameAr: "لاتيه",
    nameEn: "Latte",
    descriptionAr: null,
    descriptionEn: null,
    imageUrl: null,
    price: "80.00",
    discountPercentage: null,
    discountStart: null,
    discountEnd: null,
    calories: 120,
    pointsReward: 8,
    isAvailable: true,
    isVisible: true,
    isCurrent: true,
    syncedAt: now,
  });
  await db.insert(externalProductSizes).values({
    externalId: 91,
    externalProductId: 9,
    nameAr: "كبير",
    nameEn: "Large",
    price: "100.00",
    isDefault: true,
    isCurrent: true,
    syncedAt: now,
  });
  await db.insert(externalModifierGroups).values({
    externalId: 92,
    externalProductId: 9,
    nameAr: "إضافات",
    nameEn: "Extras",
    isRequired: true,
    maxSelections: 2,
    isCurrent: true,
    syncedAt: now,
  });
  await db.insert(externalModifierOptions).values({
    externalId: 93,
    externalModifierGroupId: 92,
    nameAr: "شوت إضافي",
    nameEn: "Extra shot",
    extraPrice: "15.00",
    stockEffect: "mapped",
    isCurrent: true,
    syncedAt: now,
  });
  await db.insert(externalSizeIngredients).values({
    externalSizeId: 91,
    itemId: ingredient.insertId,
    quantity: "0.020",
  });
  await db.insert(externalModifierIngredients).values({
    externalModifierOptionId: 93,
    itemId: ingredient.insertId,
    quantity: "0.010",
  });
  const [batch] = await db.insert(stockBatches).values({
    itemId: ingredient.insertId,
    warehouse: "cafe",
    initialQuantity: "1.000",
    remainingQuantity: "1.000",
    unitCost: "10.000000",
    receivedAt: new Date("2026-08-18T08:00:00.000Z"),
    sourceType: "transfer_in",
  });
  await db.insert(stockMovements).values({
    itemId: ingredient.insertId,
    warehouse: "cafe",
    batchId: batch.insertId,
    movementType: "transfer_in",
    quantity: "1.000",
    unitCost: "10.000000",
    occurredAt: new Date("2026-08-18T08:00:00.000Z"),
  });
  return { itemId: ingredient.insertId, batchId: batch.insertId };
}

const saleBody = (clientRequestId = randomUUID()) => ({
  clientRequestId,
  lines: [
    {
      type: "external_product",
      externalProductId: 9,
      externalSizeId: 91,
      quantity: 2,
      modifiers: [{ externalModifierOptionId: 93, quantity: 2 }],
    },
  ],
  discount: null,
  cashReceived: 300,
});

describe("external-product POS orders", () => {
  it("requires authentication and only lets cashiers record sales", async () => {
    expect((await request(app()).get("/api/orders")).status).toBe(401);
    expect((await request(app()).post("/api/orders").send(saleBody())).status).toBe(401);
    expect(
      (
        await request(app())
          .post("/api/orders")
          .set(adminAuthorization)
          .send(saleBody())
      ).status,
    ).toBe(403);
  });

  it("snapshots names and deducts size plus modifier ingredients through FIFO", async () => {
    const fixture = await createExternalProductFixture();

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(saleBody());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      subtotal: "260.00",
      total: "260.00",
      totalCost: "0.80",
      lines: [
        {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: 91,
          productName: "لاتيه",
          sizeName: "كبير",
          quantity: "2.000",
          modifiers: [
            {
              externalModifierGroupId: 92,
              externalModifierOptionId: 93,
              groupName: "إضافات",
              optionName: "شوت إضافي",
              quantity: 2,
              unitExtraPrice: "15.00",
            },
          ],
          allocations: [expect.objectContaining({ quantity: "0.080" })],
        },
      ],
    });
    const [batch] = await db
      .select({ remainingQuantity: stockBatches.remainingQuantity })
      .from(stockBatches)
      .where(eq(stockBatches.id, fixture.batchId));
    expect(batch.remainingQuantity).toBe("0.920");
  });

  it("rejects unknown modifiers without creating a partial order", async () => {
    await createExternalProductFixture();
    const body = saleBody();
    body.lines[0]!.modifiers = [
      { externalModifierOptionId: 999_999, quantity: 1 },
    ];

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(body);

    expect(response.status).toBe(400);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("allows and flags external-product sales that create negative stock", async () => {
    const fixture = await createExternalProductFixture();
    await db
      .update(stockBatches)
      .set({ remainingQuantity: "0.010" })
      .where(eq(stockBatches.id, fixture.batchId));

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(saleBody());

    expect(response.status).toBe(201);
    expect(response.body.isNegativeStock).toBe(true);
    expect(response.body.lines[0]).toMatchObject({
      hasStockDeficit: true,
      totalCost: "0.10",
    });
    expect(response.body.lines[0].allocations).toEqual([
      expect.objectContaining({ quantity: "0.010", batchId: fixture.batchId }),
      expect.objectContaining({ quantity: "0.070", batchId: null }),
    ]);
  });

  it("replays the same client request without consuming stock twice", async () => {
    const fixture = await createExternalProductFixture();
    const body = saleBody();

    const first = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(body);
    const replay = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(body);

    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const [batch] = await db
      .select({ remainingQuantity: stockBatches.remainingQuantity })
      .from(stockBatches)
      .where(eq(stockBatches.id, fixture.batchId));
    expect(batch.remainingQuantity).toBe("0.920");
  });
});
