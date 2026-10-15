import { beforeEach, it, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  items,
  stockBatches,
  stockMovements,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);
let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  adminAuthorization = await loginAs(app(), "admin");
  cashierAuthorization = await loginAs(app(), "cashier");
});

async function createLeafCategory(name = "تحضيرات") {
  const [category] = await db.insert(categories).values(testBranchValues({ name })).$returningId();
  return category.id;
}

async function createItem(
  categoryId: string,
  name: string,
  type: "raw" | "resale" | "prepared" = "raw",
  stockUnit = "جم",
) {
  const [item] = await db.insert(items).values(testBranchValues({
    code: nextTestItemCode(),
    name,
    categoryId,
    type,
    stockUnit,
  })).$returningId();
  return item.id;
}

async function receiveCafeBatch(
  itemId: string,
  quantity: string,
  unitCost: string,
  receivedAt: Date,
  warehouse: "cafe" | "main" = "cafe",
) {
  const [batch] = await db.insert(stockBatches).values(testBranchValues({
    itemId,
    warehouse,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitCost,
    receivedAt,
    sourceType: "transfer_in",
  })).$returningId();
  await db.insert(stockMovements).values(testBranchValues({
    itemId,
    warehouse,
    batchId: batch.id,
    movementType: "transfer_in",
    quantity,
    unitCost,
    occurredAt: receivedAt,
  }));
  return batch.id;
}

function preparedBody(input: {
  categoryId: string;
  outputItemId: string;
  ingredientItemId: string;
  ingredientQuantity?: number;
  baseYield?: number;
  name?: string;
}) {
  return {
    type: "prepared" as const,
    name: input.name ?? "شربات سكر",
    categoryId: input.categoryId,
    outputItemId: input.outputItemId,
    baseYield: input.baseYield ?? 2,
    ingredients: [
      {
        itemId: input.ingredientItemId,
        quantity: input.ingredientQuantity ?? 0.5,
      },
    ],
  };
}

function createPreparedRecipe(input: Parameters<typeof preparedBody>[0]) {
  return request(app())
    .post("/api/recipes")
    .set(adminAuthorization)
    .send(preparedBody(input));
}

describe("prepared recipes and preparations", () => {
  it("rejects local sellable-product CRUD and enforces admin-only prepared recipes", async () => {
    const categoryId = await createLeafCategory();
    const ingredientId = await createItem(categoryId, "سكر");
    const outputId = await createItem(categoryId, "شربات", "prepared", "لتر");

    const localProduct = await request(app())
      .post("/api/recipes")
      .set(adminAuthorization)
      .send({
        type: "product",
        name: "منتج محلي",
        categoryId,
        sizes: [
          {
            name: "واحد",
            sellingPrice: 10,
            ingredients: [{ itemId: ingredientId, quantity: 1 }],
          },
        ],
      });
    expect(localProduct.status).toBe(400);

    const cashierCreate = await request(app())
      .post("/api/recipes")
      .set(cashierAuthorization)
      .send(
        preparedBody({
          categoryId,
          outputItemId: outputId,
          ingredientItemId: ingredientId,
        }),
      );
    expect(cashierCreate.status).toBe(403);

    const created = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
    });
    expect(created.status).toBe(201);
    const detail = await request(app())
      .get(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({
      type: "prepared",
      outputItemId: outputId,
      baseYield: "2.000",
    });

    const updated = await request(app())
      .put(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization)
      .send(
        preparedBody({
          categoryId,
          outputItemId: outputId,
          ingredientItemId: ingredientId,
          name: "شربات محدث",
        }),
      );
    expect(updated.status).toBe(200);
    expect(
      (
        await request(app())
          .delete(`/api/recipes/${created.body.id}`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app())
          .put(`/api/recipes/${created.body.id}/active`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);
  });

  it("scales a prepared recipe, consumes FIFO, and receives one costed output batch", async () => {
    const categoryId = await createLeafCategory();
    const sugarId = await createItem(categoryId, "سكر");
    const syrupId = await createItem(categoryId, "شربات", "prepared", "لتر");
    const firstBatchId = await receiveCafeBatch(
      sugarId,
      "1.000",
      "10.000000",
      new Date("2026-07-18T00:00:00.000Z"),
    );
    const secondBatchId = await receiveCafeBatch(
      sugarId,
      "2.000",
      "20.000000",
      new Date("2026-07-19T00:00:00.000Z"),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: syrupId,
      ingredientItemId: sugarId,
      ingredientQuantity: 1,
      baseYield: 2,
    });

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 5, notes: "تجهيز الوردية" });

    expect(prepared.status).toBe(201);
    const detail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({
      producedQuantity: "5.000",
      totalCost: "40.00",
      unitCost: "8.000000",
      outputItemId: syrupId,
    });
    expect(detail.body.allocations).toEqual([
      expect.objectContaining({
        quantity: "1.000",
        unitCost: "10.000000",
        sourceBatchId: firstBatchId,
      }),
      expect.objectContaining({
        quantity: "1.500",
        unitCost: "20.000000",
        sourceBatchId: secondBatchId,
      }),
    ]);
    const [outputBatch] = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.itemId, syrupId),
          eq(stockBatches.warehouse, "cafe"),
        ),
      );
    expect(outputBatch).toMatchObject({
      initialQuantity: "5.000",
      remainingQuantity: "5.000",
      unitCost: "8.000000",
      sourceType: "preparation_in",
    });
  });

  it("prepares with a missing ingredient, costing the shortfall at the last known cost", async () => {
    const categoryId = await createLeafCategory();
    const sugarId = await createItem(categoryId, "سكر");
    const syrupId = await createItem(categoryId, "شربات", "prepared", "لتر");
    // only the main warehouse holds the sugar; the cafe has none to consume
    await receiveCafeBatch(
      sugarId,
      "3.000",
      "12.000000",
      new Date("2026-07-18T00:00:00.000Z"),
      "main",
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: syrupId,
      ingredientItemId: sugarId,
      ingredientQuantity: 1,
      baseYield: 2,
    });
    expect(recipe.status).toBe(201);

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 5, notes: null });
    expect(prepared.status).toBe(201);

    const detail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({
      producedQuantity: "5.000",
      totalCost: "30.00",
      unitCost: "6.000000",
      isNegativeStock: true,
    });
    expect(detail.body.allocations).toEqual([
      expect.objectContaining({
        quantity: "2.500",
        unitCost: "12.000000",
        sourceBatchId: null,
      }),
    ]);
    const [outputBatch] = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.itemId, syrupId),
          eq(stockBatches.warehouse, "cafe"),
        ),
      );
    expect(outputBatch).toMatchObject({
      initialQuantity: "5.000",
      unitCost: "6.000000",
      sourceType: "preparation_in",
    });
  });

  it("costs a cafe shortfall from main stock for the cost card", async () => {
    const categoryId = await createLeafCategory();
    const milkId = await createItem(categoryId, "لبن");
    const outputId = await createItem(categoryId, "لبن مبخر", "prepared", "لتر");
    await receiveCafeBatch(milkId, "1.000", "10.000000", new Date("2026-07-18T00:00:00.000Z"));
    await receiveCafeBatch(milkId, "5.000", "12.000000", new Date("2026-07-17T00:00:00.000Z"), "main");
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: milkId,
      ingredientQuantity: 3,
      baseYield: 2,
    });

    const detail = await request(app())
      .get(`/api/recipes/${recipe.body.id}`)
      .set(adminAuthorization);

    expect(detail.body).toMatchObject({
      currentCost: "34.00",
      estimatedUnitCost: "17.000000",
      hasSufficientStock: false,
    });
    expect(detail.body.ingredients).toEqual([
      expect.objectContaining({
        itemId: milkId,
        itemCode: expect.any(Number),
        costSource: "mixed",
        currentCost: "34.00",
        availableQuantity: "1.000",
        hasSufficientStock: false,
      }),
    ]);
  });

  it("prepares below the cafe balance, costing the shortfall at the last known cost", async () => {
    const categoryId = await createLeafCategory();
    const ingredientId = await createItem(categoryId, "فانيليا");
    const outputId = await createItem(categoryId, "صوص", "prepared", "لتر");
    const inputBatchId = await receiveCafeBatch(
      ingredientId,
      "1.000",
      "15.000000",
      new Date("2026-07-18T00:00:00.000Z"),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
      ingredientQuantity: 2,
      baseYield: 1,
    });

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 1 });
    expect(prepared.status).toBe(201);
    const [inputBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, inputBatchId));
    expect(inputBatch.remainingQuantity).toBe("0.000");
    const detail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({
      producedQuantity: "1.000",
      totalCost: "30.00",
      unitCost: "30.000000",
      isNegativeStock: true,
    });
    expect(detail.body.allocations).toEqual([
      expect.objectContaining({
        quantity: "1.000",
        unitCost: "15.000000",
        sourceBatchId: inputBatchId,
      }),
      expect.objectContaining({
        quantity: "1.000",
        unitCost: "15.000000",
        sourceBatchId: null,
      }),
    ]);
  });

  it("rejects direct and indirect prepared-item recipe cycles", async () => {
    const categoryId = await createLeafCategory();
    const firstId = await createItem(categoryId, "قاعدة أ", "prepared");
    const secondId = await createItem(categoryId, "قاعدة ب", "prepared");

    expect(
      (
        await createPreparedRecipe({
          categoryId,
          outputItemId: firstId,
          ingredientItemId: firstId,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await createPreparedRecipe({
          categoryId,
          outputItemId: firstId,
          ingredientItemId: secondId,
          name: "وصفة أ",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await createPreparedRecipe({
          categoryId,
          outputItemId: secondId,
          ingredientItemId: firstId,
          name: "وصفة ب",
        })
      ).status,
    ).toBe(409);
  });

  it("runs competing preparations serially, letting the second take cafe stock negative", async () => {
    const categoryId = await createLeafCategory();
    const ingredientId = await createItem(categoryId, "مركز");
    const outputId = await createItem(categoryId, "خلطة", "prepared");
    await receiveCafeBatch(
      ingredientId,
      "1.000",
      "10.000000",
      new Date("2026-07-18T00:00:00.000Z"),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
      ingredientQuantity: 1,
      baseYield: 1,
    });

    const results = await Promise.all([
      request(app())
        .post(`/api/recipes/${recipe.body.id}/prepare`)
        .set(adminAuthorization)
        .send({ quantity: 1 }),
      request(app())
        .post(`/api/recipes/${recipe.body.id}/prepare`)
        .set(adminAuthorization)
        .send({ quantity: 1 }),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    const cafeStock = await request(app())
      .get("/api/inventory/cafe/stock")
      .set(adminAuthorization);
    expect(
      cafeStock.body.find(
        (row: { itemId: string }) => row.itemId === ingredientId,
      ),
    ).toMatchObject({ quantity: "-1.000" });
  });
});
