import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  externalCategories,
  externalProductIngredients,
  externalProducts,
  items,
  stockBatches,
  stockMovements,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "./api-setup.js";
import { testBranchValues } from "./ids.js";

export const app = createApp(db, appOptions);

export async function createExternalCategoryFixture() {
  const now = new Date();
  const [itemCategory] = await db
    .insert(categories)
    .values(testBranchValues({ name: "مخزون" }))
    .$returningId();
  const [ingredient] = await db
    .insert(items)
    .values(
      testBranchValues({
        code: nextTestItemCode(),
        name: "بن",
        categoryId: itemCategory.id,
        type: "raw",
        stockUnit: "كجم",
      }),
    )
    .$returningId();
  await db.insert(externalCategories).values(
    testBranchValues({
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
    }),
  );
  await db.insert(externalProducts).values(
    testBranchValues({
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
    }),
  );
  await db.insert(externalProductIngredients).values(
    testBranchValues({
      externalProductId: 9,
      itemId: ingredient.id,
      quantity: "0.020",
    }),
  );
  const [batch] = await db
    .insert(stockBatches)
    .values(
      testBranchValues({
        itemId: ingredient.id,
        warehouse: "cafe",
        initialQuantity: "1.000",
        remainingQuantity: "1.000",
        unitCost: "10.000000",
        receivedAt: new Date("2026-08-18T08:00:00.000Z"),
        sourceType: "transfer_in",
      }),
    )
    .$returningId();
  await db.insert(stockMovements).values(
    testBranchValues({
      itemId: ingredient.id,
      warehouse: "cafe",
      batchId: batch.id,
      movementType: "transfer_in",
      quantity: "1.000",
      unitCost: "10.000000",
      occurredAt: new Date("2026-08-18T08:00:00.000Z"),
    }),
  );
}

export async function sellLatte(cashierAuthorization: {
  readonly Authorization: string;
}) {
  const sale = await request(app)
    .post("/api/orders")
    .set(cashierAuthorization)
    .send({
      clientRequestId: randomUUID(),
      lines: [
        {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: null,
          quantity: 2,
          modifiers: [],
        },
      ],
      discount: null,
      cashReceived: 300,
    });
  expect(sale.status).toBe(201);
  return sale.body as { id: string; lines: { id: string }[] };
}
