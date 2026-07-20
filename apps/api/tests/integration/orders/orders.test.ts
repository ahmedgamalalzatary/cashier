import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import { createApp } from "../../../src/app.js";
import {
  categories,
  items,
  recipeIngredients,
  recipes,
  recipeSizes,
  stockBatches,
  stockMovements,
} from "../../../src/db/schema.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let cashierAuthorization: { readonly Authorization: string };
let adminAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  cashierAuthorization = await loginAs(app(), "cashier");
  adminAuthorization = await loginAs(app(), "admin");
});

async function createProductFixture() {
  const [mainCategory] = await db
    .insert(categories)
    .values({ name: "مشروبات" });
  const [subCategory] = await db.insert(categories).values({
    name: "قهوة",
    parentId: mainCategory.insertId,
  });
  const [ingredient] = await db.insert(items).values({
    name: "بن",
    categoryId: subCategory.insertId,
    type: "raw",
    stockUnit: "كجم",
  });
  const [recipe] = await db.insert(recipes).values({
    name: "لاتيه",
    type: "product",
    categoryId: subCategory.insertId,
  });
  const [size] = await db.insert(recipeSizes).values({
    recipeId: recipe.insertId,
    name: "كبير",
    sellingPrice: "40.00",
  });
  await db.insert(recipeIngredients).values({
    recipeSizeId: size.insertId,
    itemId: ingredient.insertId,
    quantity: "0.750",
  });
  return {
    mainCategoryId: mainCategory.insertId,
    subCategoryId: subCategory.insertId,
    ingredientId: ingredient.insertId,
    recipeId: recipe.insertId,
    sizeId: size.insertId,
  };
}

async function receiveCafeBatch(
  itemId: number,
  quantity: string,
  unitCost: string,
  receivedAt: Date,
) {
  const [batch] = await db.insert(stockBatches).values({
    itemId,
    warehouse: "cafe",
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitCost,
    receivedAt,
    sourceType: "transfer_in",
  });
  await db.insert(stockMovements).values({
    itemId,
    warehouse: "cafe",
    batchId: batch.insertId,
    movementType: "transfer_in",
    quantity,
    unitCost,
    occurredAt: receivedAt,
  });
  return batch.insertId;
}

describe("POS orders", () => {
  it("requires authentication for catalog, creation, history, and detail", async () => {
    expect((await request(app()).get("/api/orders/catalog")).status).toBe(401);
    expect((await request(app()).get("/api/orders")).status).toBe(401);
    expect((await request(app()).get("/api/orders/1")).status).toBe(401);
    expect(
      (
        await request(app()).post("/api/orders").send({
          lines: [],
          cashReceived: 0,
        })
      ).status,
    ).toBe(401);
  });

  it("lists the active recipe-product catalog for a cashier with category hierarchy", async () => {
    const fixture = await createProductFixture();

    const response = await request(app())
      .get("/api/orders/catalog")
      .set(cashierAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        type: "recipe",
        recipeId: fixture.recipeId,
        name: "لاتيه",
        categoryId: fixture.subCategoryId,
        mainCategoryId: fixture.mainCategoryId,
        mainCategoryName: "مشروبات",
        subCategoryId: fixture.subCategoryId,
        subCategoryName: "قهوة",
        sizes: [
          {
            id: fixture.sizeId,
            name: "كبير",
            sellingPrice: "40.00",
          },
        ],
      },
    ]);
  });

  it("excludes recipe products under an inactive parent category", async () => {
    const fixture = await createProductFixture();
    await db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, fixture.mainCategoryId));

    const response = await request(app())
      .get("/api/orders/catalog")
      .set(cashierAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("excludes resale items under an inactive parent category", async () => {
    const [parentCategory] = await db.insert(categories).values({
      name: "Inactive parent",
      isActive: false,
    });
    const [leafCategory] = await db.insert(categories).values({
      name: "Active leaf",
      parentId: parentCategory.insertId,
    });
    await db.insert(items).values({
      name: "Hidden resale item",
      categoryId: leafCategory.insertId,
      type: "resale",
      sellingPrice: "25.00",
      stockUnit: "kg",
    });

    const response = await request(app())
      .get("/api/orders/catalog")
      .set(cashierAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("saves a discounted recipe sale with authoritative totals and FIFO snapshots", async () => {
    const fixture = await createProductFixture();
    const firstBatchId = await receiveCafeBatch(
      fixture.ingredientId,
      "1.000",
      "10.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );
    const secondBatchId = await receiveCafeBatch(
      fixture.ingredientId,
      "2.000",
      "20.000000",
      new Date("2026-07-19T08:00:00.000Z"),
    );

    const created = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "recipe", recipeSizeId: fixture.sizeId, quantity: 2 }],
        discount: { type: "percent", value: 10 },
        cashReceived: 100,
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: expect.any(Number),
      orderNumber: expect.stringMatching(/^POS-/),
      subtotal: "80.00",
      total: "72.00",
      changeAmount: "28.00",
      lines: [expect.objectContaining({ productName: "لاتيه" })],
    });

    const detail = await request(app())
      .get(`/api/orders/${created.body.id}`)
      .set(cashierAuthorization);

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: created.body.id,
      orderNumber: created.body.orderNumber,
      cashierName: "كاشير",
      shiftId: null,
      subtotal: "80.00",
      discountType: "percent",
      discountValue: "10.00",
      discountAmount: "8.00",
      total: "72.00",
      cashReceived: "100.00",
      changeAmount: "28.00",
      totalCost: "20.00",
      isNegativeStock: false,
    });
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        type: "recipe",
        recipeId: fixture.recipeId,
        recipeSizeId: fixture.sizeId,
        productName: "لاتيه",
        sizeName: "كبير",
        quantity: "2.000",
        unitPrice: "40.00",
        lineSubtotal: "80.00",
        totalCost: "20.00",
        hasStockDeficit: false,
        allocations: [
          expect.objectContaining({
            itemId: fixture.ingredientId,
            itemName: "بن",
            batchId: firstBatchId,
            quantity: "1.000",
            unitCost: "10.000000",
            lineCost: "10.00",
            stockMovementId: expect.any(Number),
          }),
          expect.objectContaining({
            itemId: fixture.ingredientId,
            itemName: "بن",
            batchId: secondBatchId,
            quantity: "0.500",
            unitCost: "20.000000",
            lineCost: "10.00",
            stockMovementId: expect.any(Number),
          }),
        ],
      }),
    ]);

    const saleMovements = await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.referenceType, "order"),
          eq(stockMovements.referenceId, created.body.id),
        ),
      );
    expect(saleMovements).toHaveLength(2);
    expect(saleMovements.map((row) => row.quantity)).toEqual([
      "-1.000",
      "-0.500",
    ]);
  });

  it("sells a fractional resale item at its configured price and preserves the receipt snapshot", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: "منتجات جاهزة" });
    const [item] = await db.insert(items).values({
      name: "بن معبأ",
      categoryId: category.insertId,
      type: "resale",
      sellingPrice: "25.00",
      stockUnit: "كجم",
    });
    const batchId = await receiveCafeBatch(
      item.insertId,
      "2.000",
      "8.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );

    const catalog = await request(app())
      .get("/api/orders/catalog")
      .set(cashierAuthorization);
    expect(catalog.body).toEqual([
      expect.objectContaining({
        type: "item",
        itemId: item.insertId,
        name: "بن معبأ",
        sellingPrice: "25.00",
        stockUnit: "كجم",
      }),
    ]);

    const created = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "item", itemId: item.insertId, quantity: 1.5 }],
        discount: { type: "fixed", value: 2.5 },
        cashReceived: 40,
      });
    expect(created.status).toBe(201);

    await db
      .update(items)
      .set({ name: "اسم جديد", sellingPrice: "30.00" })
      .where(eq(items.id, item.insertId));
    const detail = await request(app())
      .get(`/api/orders/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      subtotal: "37.50",
      discountType: "fixed",
      discountValue: "2.50",
      discountAmount: "2.50",
      total: "35.00",
      cashReceived: "40.00",
      changeAmount: "5.00",
      totalCost: "12.00",
      isNegativeStock: false,
    });
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        type: "item",
        itemId: item.insertId,
        productName: "بن معبأ",
        sizeName: null,
        quantity: "1.500",
        unitPrice: "25.00",
        lineSubtotal: "37.50",
        totalCost: "12.00",
        allocations: [
          expect.objectContaining({
            batchId,
            quantity: "1.500",
            unitCost: "8.000000",
          }),
        ],
      }),
    ]);

    const recent = await request(app())
      .get("/api/orders")
      .set(cashierAuthorization);
    expect(recent.status).toBe(200);
    expect(recent.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        orderNumber: created.body.orderNumber,
        total: "35.00",
      }),
    ]);
  });

  it("allows a sale to go negative and records the exact uncovered quantity", async () => {
    const fixture = await createProductFixture();
    await receiveCafeBatch(
      fixture.ingredientId,
      "0.250",
      "12.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );

    const created = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 }],
        cashReceived: 40,
      });
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/orders/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      totalCost: "3.00",
      isNegativeStock: true,
    });
    expect(detail.body.lines[0]).toMatchObject({
      totalCost: "3.00",
      hasStockDeficit: true,
    });
    expect(detail.body.lines[0].allocations).toEqual([
      expect.objectContaining({
        batchId: expect.any(Number),
        quantity: "0.250",
        unitCost: "12.000000",
        lineCost: "3.00",
      }),
      expect.objectContaining({
        batchId: null,
        quantity: "0.500",
        unitCost: "0.000000",
        lineCost: "0.00",
      }),
    ]);

    const deficitMovements = await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.referenceType, "order"),
          eq(stockMovements.referenceId, created.body.id),
          isNull(stockMovements.batchId),
        ),
      );
    expect(deficitMovements).toEqual([
      expect.objectContaining({ quantity: "-0.500", unitCost: "0.000000" }),
    ]);
  });

  it("rejects underpayment and rolls back the whole cart when any selection is invalid", async () => {
    const fixture = await createProductFixture();
    const batchId = await receiveCafeBatch(
      fixture.ingredientId,
      "2.000",
      "10.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );

    const underpaid = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 }],
        cashReceived: 39.99,
      });
    expect(underpaid.status).toBe(400);

    const invalidCart = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [
          { type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 },
          { type: "recipe", recipeSizeId: 999_999, quantity: 1 },
        ],
        cashReceived: 100,
      });
    expect(invalidCart.status).toBe(404);

    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, batchId));
    expect(batch.remainingQuantity).toBe("2.000");
    const history = await request(app())
      .get("/api/orders")
      .set(cashierAuthorization);
    expect(history.body).toEqual([]);
  });

  it("replays a duplicate checkout key without creating another order or stock deduction", async () => {
    const fixture = await createProductFixture();
    await receiveCafeBatch(
      fixture.ingredientId,
      "2.000",
      "10.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );
    const body = {
      clientRequestId: randomUUID(),
      lines: [{ type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 }],
      cashReceived: 40,
    };

    const [first, replay] = await Promise.all([
      request(app()).post("/api/orders").set(cashierAuthorization).send(body),
      request(app()).post("/api/orders").set(cashierAuthorization).send(body),
    ]);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const saleMovements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceType, "order"));
    expect(saleMovements).toHaveLength(1);
  });

  it("rejects concurrent reuse of a checkout key for different payloads", async () => {
    const fixture = await createProductFixture();
    await receiveCafeBatch(
      fixture.ingredientId,
      "3.000",
      "10.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );
    const clientRequestId = randomUUID();

    const responses = await Promise.all([
      request(app())
        .post("/api/orders")
        .set(cashierAuthorization)
        .send({
          clientRequestId,
          lines: [
            { type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 },
          ],
          cashReceived: 40,
        }),
      request(app())
        .post("/api/orders")
        .set(cashierAuthorization)
        .send({
          clientRequestId,
          lines: [
            { type: "recipe", recipeSizeId: fixture.sizeId, quantity: 2 },
          ],
          cashReceived: 80,
        }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const history = await request(app())
      .get("/api/orders")
      .set(cashierAuthorization);
    expect(history.body).toHaveLength(1);
  });

  it("keeps sold recipe receipts immutable while allowing future recipe edits", async () => {
    const fixture = await createProductFixture();
    await receiveCafeBatch(
      fixture.ingredientId,
      "2.000",
      "10.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );
    const sale = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [{ type: "recipe", recipeSizeId: fixture.sizeId, quantity: 1 }],
        cashReceived: 40,
      });

    const edited = await request(app())
      .put(`/api/recipes/${fixture.recipeId}`)
      .set(adminAuthorization)
      .send({
        type: "product",
        name: "لاتيه جديد",
        categoryId: fixture.subCategoryId,
        sizes: [
          {
            name: "وسط",
            sellingPrice: 45,
            ingredients: [{ itemId: fixture.ingredientId, quantity: 0.8 }],
          },
        ],
      });

    expect(edited.status).toBe(200);
    const receipt = await request(app())
      .get(`/api/orders/${sale.body.id}`)
      .set(cashierAuthorization);
    expect(receipt.body.lines[0]).toMatchObject({
      recipeSizeId: null,
      productName: "لاتيه",
      sizeName: "كبير",
      unitPrice: "40.00",
    });
  });

  it("defines order cost as the sum of persisted rounded line costs", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: "بيع مباشر" });
    const [firstItem] = await db.insert(items).values({
      name: "نقطة أ",
      categoryId: category.insertId,
      type: "resale",
      sellingPrice: "1.00",
      stockUnit: "كجم",
    });
    const [secondItem] = await db.insert(items).values({
      name: "نقطة ب",
      categoryId: category.insertId,
      type: "resale",
      sellingPrice: "1.00",
      stockUnit: "كجم",
    });
    await receiveCafeBatch(
      firstItem.insertId,
      "0.001",
      "5.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );
    await receiveCafeBatch(
      secondItem.insertId,
      "0.001",
      "5.000000",
      new Date("2026-07-18T08:00:00.000Z"),
    );

    const sale = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        lines: [
          { type: "item", itemId: firstItem.insertId, quantity: 0.001 },
          { type: "item", itemId: secondItem.insertId, quantity: 0.001 },
        ],
        cashReceived: 0,
      });

    expect(sale.status).toBe(201);
    expect(
      sale.body.lines.map((line: { totalCost: string }) => line.totalCost),
    ).toEqual(["0.01", "0.01"]);
    expect(sale.body.totalCost).toBe("0.02");
  });
});
