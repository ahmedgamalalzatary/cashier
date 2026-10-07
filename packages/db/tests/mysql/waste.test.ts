import { beforeEach, it, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../apps/api/src/app.js";
import {
  categories,
  externalCategories,
  externalProducts,
  externalProductIngredients,
  externalProductSizes,
  externalSizeIngredients,
  items,
  recipeIngredients,
  recipes,
  recipeSizes,
  stockBatches,
  stockMovements,
  wasteEntries,
} from "@cashier/db";
import { appOptions, db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);
let cashierAuth: { readonly Authorization: string };

async function stockItem(
  warehouse: "main" | "cafe",
  quantities = ["2.000", "3.000"],
) {
  const [category] = await db.insert(categories).values(testBranchValues({ name: "خامات" })).$returningId();
  const [item] = await db.insert(items).values(testBranchValues({
    code: nextTestItemCode(),
    name: "لبن",
    categoryId: category.id,
    type: "raw",
    stockUnit: "لتر",
  })).$returningId();
  for (const [index, quantity] of quantities.entries()) {
    await db.insert(stockBatches).values(testBranchValues({
      itemId: item.id,
      warehouse,
      initialQuantity: quantity,
      remainingQuantity: quantity,
      unitCost: index === 0 ? "2.000000" : "3.000000",
      receivedAt: new Date(Date.now() + index),
      sourceType: "purchase",
    }));
  }
  return item.id;
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
      syncedAt,
    }));
    await db.insert(externalProducts).values(testBranchValues({
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
    }));
    await db.insert(externalProductSizes).values(testBranchValues({
      externalId: 91,
      externalProductId: 9,
      nameAr: "كبير",
      nameEn: "Large",
      price: "30.00",
      isDefault: true,
      isCurrent: true,
      syncedAt,
    }));
    await db.insert(externalSizeIngredients).values(testBranchValues({
      externalSizeId: 91,
      itemId,
      quantity: "0.500",
    }));

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

  it("records recipe waste by consuming its size ingredients", async () => {
    const itemId = await stockItem("cafe");
    const [category] = await db.insert(categories).values(testBranchValues({ name: "مشروبات" })).$returningId();
    const [recipe] = await db.insert(recipes).values(testBranchValues({
      name: "كابتشينو",
      type: "product",
      categoryId: category.id,
      outputItemId: null,
    })).$returningId();
    const [size] = await db.insert(recipeSizes).values(testBranchValues({
      recipeId: recipe.id,
      name: "وسط",
      sellingPrice: "25.00",
      outputQuantity: null,
      sortOrder: 0,
    })).$returningId();
    await db.insert(recipeIngredients).values(testBranchValues({
      recipeSizeId: size.id,
      itemId,
      quantity: "0.500",
    }));

    const response = await request(app())
      .post("/api/waste")
      .set(cashierAuth)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "cafe",
        target: {
          type: "recipe",
          recipeId: recipe.id,
          recipeSizeId: size.id,
        },
        quantity: 2,
        reason: "spill",
        note: null,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      targetType: "recipe",
      targetName: "كابتشينو",
      sizeName: "وسط",
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
    const [stored] = await db
      .select()
      .from(wasteEntries)
      .where(eq(wasteEntries.targetType, "recipe"));
    expect(stored.recipeId).toBe(recipe.id);
    expect(stored.recipeSizeId).toBe(size.id);
  });

  // Two recipes over the same stock items, inserted in opposite orders.
  async function opposingIngredientRecipes() {
    const itemIds: string[] = [];
    for (let index = 0; index < 15; index += 1) {
      itemIds.push(await stockItem("cafe", ["10.000"]));
    }
    const [category] = await db.insert(categories).values(testBranchValues({ name: "مشروبات" })).$returningId();
    const makeRecipe = async (name: string, ingredientItemIds: string[]) => {
      const [recipe] = await db.insert(recipes).values(testBranchValues({
        name,
        type: "product",
        categoryId: category.id,
        outputItemId: null,
      })).$returningId();
      const [size] = await db.insert(recipeSizes).values(testBranchValues({
        recipeId: recipe.id,
        name: "وسط",
        sellingPrice: "25.00",
        outputQuantity: null,
        sortOrder: 0,
      })).$returningId();
      for (const itemId of ingredientItemIds) {
        await db.insert(recipeIngredients).values(testBranchValues({
          recipeSizeId: size.id,
          itemId,
          quantity: "0.100",
        }));
      }
      return { recipeId: recipe.id, recipeSizeId: size.id };
    };
    const reverse = await makeRecipe("هالك أ", [...itemIds].reverse());
    const forward = await makeRecipe("هالك ب", itemIds);
    return { itemIds, reverse, forward };
  }

  it("preserves stock after concurrent multi-item recipe wastes", async () => {
    const adminAuth = await loginAs(app(), "admin");
    const { itemIds, reverse, forward } = await opposingIngredientRecipes();

    const waste = (target: { recipeId: string; recipeSizeId: string }) =>
      request(app())
        .post("/api/waste")
        .set(adminAuth)
        .send({
          clientRequestId: crypto.randomUUID(),
          warehouse: "cafe",
          target: { type: "recipe", ...target },
          quantity: 1,
          reason: "spill",
          note: null,
        });

    const responses = await Promise.all([waste(reverse), waste(forward)]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(await db.select().from(wasteEntries)).toHaveLength(2);
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.itemId, itemIds[0]));
    expect(batch.remainingQuantity).toBe("9.800");
  });

  it("preserves stock after concurrent recipe waste and sale", async () => {
    const adminAuth = await loginAs(app(), "admin");
    const { itemIds, reverse } = await opposingIngredientRecipes();
    const syncedAt = new Date();
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
      syncedAt,
    }));
    await db.insert(externalProducts).values(testBranchValues({
      externalId: 10,
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
    }));
    for (const itemId of itemIds) {
      await db.insert(externalProductIngredients).values(testBranchValues({
        externalProductId: 10,
        itemId,
        quantity: "0.100",
      }));
    }

    const responses = await Promise.all([
      request(app())
        .post("/api/orders")
        .set(cashierAuth)
        .send({
          clientRequestId: crypto.randomUUID(),
          lines: [
            {
              type: "external_product",
              externalProductId: 10,
              externalSizeId: null,
              quantity: 1,
              modifiers: [],
            },
          ],
          discount: null,
          cashReceived: 100,
        }),
      request(app())
        .post("/api/waste")
        .set(adminAuth)
        .send({
          clientRequestId: crypto.randomUUID(),
          warehouse: "cafe",
          target: { type: "recipe", ...reverse },
          quantity: 1,
          reason: "spill",
          note: null,
        }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.itemId, itemIds[0]));
    expect(batch.remainingQuantity).toBe("9.800");
  });
});
