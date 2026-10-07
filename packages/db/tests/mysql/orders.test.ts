import { beforeEach, it, testBranchValues } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
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
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { createUser, loginAs } from "../support/api-helpers.js";

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
  const [itemCategory] = await db.insert(categories).values(testBranchValues({ name: "مخزون" })).$returningId();
  const [ingredient] = await db.insert(items).values(testBranchValues({
    code: nextTestItemCode(),
    name: "بن",
    categoryId: itemCategory.id,
    type: "raw",
    stockUnit: "كجم",
  })).$returningId();
  await db.insert(externalCategories).values(testBranchValues({
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
  }));
  await db.insert(externalProducts).values(testBranchValues({
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
  }));
  await db.insert(externalProductSizes).values(testBranchValues({
    externalId: 91,
    externalProductId: 9,
    nameAr: "كبير",
    nameEn: "Large",
    price: "100.00",
    isDefault: true,
    isCurrent: true,
    syncedAt: now,
  }));
  await db.insert(externalModifierGroups).values(testBranchValues({
    externalId: 92,
    externalProductId: 9,
    nameAr: "إضافات",
    nameEn: "Extras",
    isRequired: true,
    maxSelections: 2,
    isCurrent: true,
    syncedAt: now,
  }));
  await db.insert(externalModifierOptions).values(testBranchValues({
    externalId: 93,
    externalModifierGroupId: 92,
    nameAr: "شوت إضافي",
    nameEn: "Extra shot",
    extraPrice: "15.00",
    stockEffect: "mapped",
    isCurrent: true,
    syncedAt: now,
  }));
  await db.insert(externalSizeIngredients).values(testBranchValues({
    externalSizeId: 91,
    itemId: ingredient.id,
    quantity: "0.020",
  }));
  await db.insert(externalModifierIngredients).values(testBranchValues({
    externalModifierOptionId: 93,
    itemId: ingredient.id,
    quantity: "0.010",
  }));
  const [batch] = await db.insert(stockBatches).values(testBranchValues({
    itemId: ingredient.id,
    warehouse: "cafe",
    initialQuantity: "1.000",
    remainingQuantity: "1.000",
    unitCost: "10.000000",
    receivedAt: new Date("2026-08-18T08:00:00.000Z"),
    sourceType: "transfer_in",
  })).$returningId();
  await db.insert(stockMovements).values(testBranchValues({
    itemId: ingredient.id,
    warehouse: "cafe",
    batchId: batch.id,
    movementType: "transfer_in",
    quantity: "1.000",
    unitCost: "10.000000",
    occurredAt: new Date("2026-08-18T08:00:00.000Z"),
  }));
  return { itemId: ingredient.id, batchId: batch.id };
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
  it("requires authentication and lets an admin sell without a shift", async () => {
    expect((await request(app()).get("/api/orders")).status).toBe(401);
    expect((await request(app()).post("/api/orders").send(saleBody())).status).toBe(401);

    await createExternalProductFixture();
    const response = await request(app())
      .post("/api/orders")
      .set(adminAuthorization)
      .send(saleBody());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      shiftId: null,
      isAdminSale: true,
      cashierName: "مدير",
    });
  });

  it("still requires an open shift from a cashier", async () => {
    const credentials = await createUser("cashier", "no-shift-cashier");
    const login = await request(app())
      .post("/api/auth/login")
      .send(credentials);
    const noShiftAuthorization = {
      Authorization: `Bearer ${login.body.token}`,
    };
    await createExternalProductFixture();

    const response = await request(app())
      .post("/api/orders")
      .set(noShiftAuthorization)
      .send(saleBody());

    expect(response.status).toBe(409);
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
      isAdminSale: false,
      shiftId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
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
      { externalModifierOptionId: 93, quantity: 1 },
      { externalModifierOptionId: 999_999, quantity: 1 },
    ];

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("إحدى الإضافات لا تنتمي إلى المنتج المحدد");
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

  it("totals a fixed discount equal to the subtotal down to zero cash", async () => {
    await createExternalProductFixture();

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({
        ...saleBody(),
        discount: { type: "fixed", value: 260 },
        cashReceived: 0,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      subtotal: "260.00",
      discountType: "fixed",
      discountValue: "260.00",
      discountAmount: "260.00",
      total: "0.00",
      cashReceived: "0.00",
      changeAmount: "0.00",
    });
  });

  it("rejects a fixed discount larger than the subtotal", async () => {
    await createExternalProductFixture();

    const response = await request(app())
      .post("/api/orders")
      .set(cashierAuthorization)
      .send({ ...saleBody(), discount: { type: "fixed", value: 260.01 } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("الخصم الثابت أكبر من إجمالي الطلب");
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("serializes concurrent double-spend so exactly one sale takes the deficit", async () => {
    const fixture = await createExternalProductFixture();
    await db
      .update(stockBatches)
      .set({ remainingQuantity: "0.100" })
      .where(eq(stockBatches.id, fixture.batchId));

    const responses = await Promise.all([
      request(app()).post("/api/orders").set(cashierAuthorization).send(saleBody()),
      request(app()).post("/api/orders").set(cashierAuthorization).send(saleBody()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const covered = responses.filter(
      (response) => !response.body.isNegativeStock,
    );
    const deficit = responses.filter(
      (response) => response.body.isNegativeStock,
    );
    expect(covered).toHaveLength(1);
    expect(deficit).toHaveLength(1);

    expect(covered[0]!.body.lines[0]).toMatchObject({
      hasStockDeficit: false,
      allocations: [{ batchId: fixture.batchId, quantity: "0.080" }],
    });
    expect(deficit[0]!.body.lines[0]).toMatchObject({
      hasStockDeficit: true,
      totalCost: "0.20",
      allocations: [
        { batchId: fixture.batchId, quantity: "0.020" },
        { batchId: null, quantity: "0.060" },
      ],
    });

    const [batch] = await db
      .select({ remainingQuantity: stockBatches.remainingQuantity })
      .from(stockBatches)
      .where(eq(stockBatches.id, fixture.batchId));
    expect(batch.remainingQuantity).toBe("0.000");
  });
});
