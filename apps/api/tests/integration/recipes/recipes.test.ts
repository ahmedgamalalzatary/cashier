import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../../../src/app.js";
import {
  categories,
  items,
  stockBatches,
  stockMovements,
} from "../../../src/db/schema.js";
import { appOptions, db, nextTestItemCode } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);
let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  adminAuthorization = await loginAs(app(), "admin");
  cashierAuthorization = await loginAs(app(), "cashier");
});

async function createLeafCategory(name = "تحضيرات") {
  const [category] = await db.insert(categories).values({ name });
  return category.insertId;
}

async function createItem(
  categoryId: number,
  name: string,
  type: "raw" | "resale" | "prepared" = "raw",
  stockUnit = "جم",
) {
  const [item] = await db.insert(items).values({
    code: nextTestItemCode(),
    name,
    categoryId,
    type,
    stockUnit,
  });
  return item.insertId;
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

function preparedBody(input: {
  categoryId: number;
  outputItemId: number;
  ingredientItemId: number;
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

  it("rolls an insufficient preparation back without stock or history changes", async () => {
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
    expect(prepared.status).toBe(409);
    const [inputBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, inputBatchId));
    expect(inputBatch.remainingQuantity).toBe("1.000");
    const history = await request(app())
      .get("/api/recipes/preparations")
      .set(adminAuthorization);
    expect(history.body).toEqual([]);
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

  it("serializes competing preparation runs so cafe stock is consumed once", async () => {
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
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
});
