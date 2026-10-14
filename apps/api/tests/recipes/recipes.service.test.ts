import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { RecipesRepository } from "../../src/modules/recipes/recipes.repository.js";
import { RecipesService } from "../../src/modules/recipes/recipes.service.js";

describe("RecipesService external-product boundary", () => {
  it("treats legacy local sellable products as absent", async () => {
    const legacyProduct = {
      id: testId(7),
      name: "Legacy product",
      type: "product" as const,
      categoryId: testId(2),
      categoryName: "Drinks",
      outputItemId: null,
      outputItemName: null,
      outputStockUnit: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      findRecipeHeader: vi.fn().mockResolvedValue(legacyProduct),
      transaction: vi.fn(async (callback) => callback(repository)),
      lockRecipe: vi.fn().mockResolvedValue(legacyProduct),
      listSizes: vi.fn().mockResolvedValue([]),
      listIngredients: vi.fn().mockResolvedValue([]),
    } as unknown as RecipesRepository;
    const service = new RecipesService(repository);

    await expect(service.get(testId(7))).rejects.toMatchObject({ status: 404 });
    await expect(service.deactivate(testId(7))).rejects.toMatchObject({ status: 404 });
  });
});

const preparedRecipe = (overrides: Record<string, unknown> = {}) => ({
  id: testId(3),
  name: "كابتشينو",
  type: "prepared",
  isActive: true,
  outputItemId: testId(5),
  ...overrides,
});

function txForPrepare(overrides: Record<string, unknown> = {}) {
  return {
    lockRecipe: vi.fn(async () => preparedRecipe()),
    findRecipeHeader: vi.fn(async () => ({ outputItemName: "كابتشينو جاهز" })),
    listSizes: vi.fn(async () => [{ outputQuantity: "10.000" }]),
    listIngredients: vi.fn(async () => [
      { itemId: testId(1), itemName: "بن", quantity: "1.000" },
    ]),
    lockItems: vi.fn(async () => [
      { id: testId(5), name: "كابتشينو جاهز", isActive: true },
      { id: testId(1), name: "بن", isActive: true },
    ]),
    createPreparation: vi.fn(async () => testId(77)),
    createPreparationAllocation: vi.fn(async () => undefined),
    completePreparation: vi.fn(async () => undefined),
    ...overrides,
  };
}

function serviceForPrepare(tx: Record<string, unknown>) {
  const repository = {
    transaction: vi.fn(async (callback) =>
      callback(
        tx,
        {
          consume: vi.fn(async () => ({ allocations: [] })),
          receive: vi.fn(async () => ({ batchId: testId(9) })),
        },
      ),
    ),
  } as unknown as RecipesRepository;
  return new RecipesService(repository);
}

describe("RecipesService.prepare guards", () => {
  it("404s missing recipes and legacy products", async () => {
    const missing = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => undefined) }),
    );
    await expect(
      missing.prepare(testId(999), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 404 });

    const legacy = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ type: "product" })) }),
    );
    await expect(
      legacy.prepare(testId(7), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s inactive recipes, non-producing recipes, and bad headers", async () => {
    const inactive = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ isActive: false })) }),
    );
    await expect(
      inactive.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });

    const noOutput = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ outputItemId: null })) }),
    );
    await expect(
      noOutput.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });

    const badHeader = serviceForPrepare(
      txForPrepare({ findRecipeHeader: vi.fn(async () => ({ outputItemName: null })) }),
    );
    await expect(
      badHeader.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s recipes without exactly one valid base size", async () => {
    for (const sizes of [[], [{ outputQuantity: null }], [{ outputQuantity: "1.000" }, { outputQuantity: "2.000" }]]) {
      const service = serviceForPrepare(txForPrepare({ listSizes: vi.fn(async () => sizes) }));
      await expect(
        service.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  it("404s missing locked items and 409s inactive ones", async () => {
    const missing = serviceForPrepare(
      txForPrepare({ lockItems: vi.fn(async () => [{ id: testId(5), name: "جاهز", isActive: true }]) }),
    );
    await expect(
      missing.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = serviceForPrepare(
      txForPrepare({
        lockItems: vi.fn(async () => [
          { id: testId(5), name: "جاهز", isActive: true },
          { id: testId(1), name: "بن", isActive: false },
        ]),
      }),
    );
    await expect(
      inactive.prepare(testId(3), { quantity: 2, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("400s a yield too small to scale any ingredient", async () => {
    const service = serviceForPrepare(txForPrepare());
    await expect(
      service.prepare(testId(3), { quantity: 0.001, notes: null }, testId(9)),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("RecipesService cost card costing", () => {
  const header = {
    id: testId(3),
    name: "شراب سكر",
    type: "prepared" as const,
    categoryId: testId(2),
    categoryName: "تحضيرات",
    outputItemId: testId(5),
    outputItemName: "شراب سكر",
    outputStockUnit: "مل",
    isActive: true,
  };
  const ingredient = (id: number, quantity: string) => ({
    id: testId(100 + id),
    itemId: testId(id),
    itemCode: id,
    itemName: `صنف ${id}`,
    itemType: "raw",
    stockUnit: "جم",
    quantity,
    itemIsActive: true,
  });

  function serviceWith(
    ingredients: ReturnType<typeof ingredient>[],
    batches: Record<string, { cafe?: Array<[string, string]>; main?: Array<[string, string]> }>,
  ) {
    const repository = {
      listRecipeHeaders: vi.fn(async () => [header]),
      findRecipeHeader: vi.fn(async () => header),
      listSizes: vi.fn(async () => [{ outputQuantity: "10.000" }]),
      listIngredients: vi.fn(async () => ingredients),
      availableBatches: vi.fn(async (itemId: string, warehouse: "cafe" | "main") =>
        (batches[itemId]?.[warehouse] ?? []).map(([remainingQuantity, unitCost], index) => ({
          id: `${itemId}-${warehouse}-${index}`,
          remainingQuantity,
          unitCost,
        })),
      ),
    } as unknown as RecipesRepository;
    return new RecipesService(repository);
  }

  it("costs from cafe first, then main, and marks the source", async () => {
    const service = serviceWith(
      [ingredient(1, "1.000"), ingredient(2, "2.000"), ingredient(3, "1.000")],
      {
        [testId(1)]: { cafe: [["5.000", "2.500000"]] },
        [testId(2)]: { cafe: [["1.000", "3.000000"]], main: [["5.000", "4.000000"]] },
        [testId(3)]: { main: [["1.000", "1.000000"]] },
      },
    );

    const recipe = await service.get(testId(3));

    expect(recipe.ingredients.map((row) => [row.itemCode, row.costSource, row.currentCost])).toEqual([
      [1, "cafe", "2.50"],
      [2, "mixed", "7.00"],
      [3, "main", "1.00"],
    ]);
    expect(recipe.currentCost).toBe("10.50");
    expect(recipe.estimatedUnitCost).toBe("1.050000");
    // preparing still needs the cafe stock
    expect(recipe.hasSufficientStock).toBe(false);
    expect(recipe.ingredients.map((row) => row.hasSufficientStock)).toEqual([true, false, false]);
  });

  it("shows no cost when cafe and main together are short", async () => {
    const service = serviceWith([ingredient(1, "1.000"), ingredient(2, "3.000")], {
      [testId(1)]: { cafe: [["1.000", "2.000000"]] },
      [testId(2)]: { cafe: [["1.000", "1.000000"]], main: [["1.000", "1.000000"]] },
    });

    const recipe = await service.get(testId(3));

    expect(recipe.ingredients.map((row) => [row.costSource, row.currentCost])).toEqual([
      ["cafe", "2.00"],
      [null, null],
    ]);
    expect(recipe.currentCost).toBeNull();
    expect(recipe.estimatedUnitCost).toBeNull();
  });
});
