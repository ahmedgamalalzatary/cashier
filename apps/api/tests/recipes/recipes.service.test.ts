import { describe, expect, it, vi } from "vitest";
import type { RecipesRepository } from "../../src/modules/recipes/recipes.repository.js";
import { RecipesService } from "../../src/modules/recipes/recipes.service.js";

describe("RecipesService external-product boundary", () => {
  it("treats legacy local sellable products as absent", async () => {
    const legacyProduct = {
      id: 7,
      name: "Legacy product",
      type: "product" as const,
      categoryId: 2,
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

    await expect(service.get(7)).rejects.toMatchObject({ status: 404 });
    await expect(service.deactivate(7)).rejects.toMatchObject({ status: 404 });
  });
});

const preparedRecipe = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  name: "كابتشينو",
  type: "prepared",
  isActive: true,
  outputItemId: 5,
  ...overrides,
});

function txForPrepare(overrides: Record<string, unknown> = {}) {
  return {
    lockRecipe: vi.fn(async () => preparedRecipe()),
    findRecipeHeader: vi.fn(async () => ({ outputItemName: "كابتشينو جاهز" })),
    listSizes: vi.fn(async () => [{ outputQuantity: "10.000" }]),
    listIngredients: vi.fn(async () => [
      { itemId: 1, itemName: "بن", quantity: "1.000" },
    ]),
    lockItems: vi.fn(async () => [
      { id: 5, name: "كابتشينو جاهز", isActive: true },
      { id: 1, name: "بن", isActive: true },
    ]),
    createPreparation: vi.fn(async () => 77),
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
          receive: vi.fn(async () => ({ batchId: 9 })),
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
      missing.prepare(999, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 404 });

    const legacy = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ type: "product" })) }),
    );
    await expect(
      legacy.prepare(7, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s inactive recipes, non-producing recipes, and bad headers", async () => {
    const inactive = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ isActive: false })) }),
    );
    await expect(
      inactive.prepare(3, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 409 });

    const noOutput = serviceForPrepare(
      txForPrepare({ lockRecipe: vi.fn(async () => preparedRecipe({ outputItemId: null })) }),
    );
    await expect(
      noOutput.prepare(3, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 409 });

    const badHeader = serviceForPrepare(
      txForPrepare({ findRecipeHeader: vi.fn(async () => ({ outputItemName: null })) }),
    );
    await expect(
      badHeader.prepare(3, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s recipes without exactly one valid base size", async () => {
    for (const sizes of [[], [{ outputQuantity: null }], [{ outputQuantity: "1.000" }, { outputQuantity: "2.000" }]]) {
      const service = serviceForPrepare(txForPrepare({ listSizes: vi.fn(async () => sizes) }));
      await expect(
        service.prepare(3, { quantity: 2, notes: null }, 9),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  it("404s missing locked items and 409s inactive ones", async () => {
    const missing = serviceForPrepare(
      txForPrepare({ lockItems: vi.fn(async () => [{ id: 5, name: "جاهز", isActive: true }]) }),
    );
    await expect(
      missing.prepare(3, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = serviceForPrepare(
      txForPrepare({
        lockItems: vi.fn(async () => [
          { id: 5, name: "جاهز", isActive: true },
          { id: 1, name: "بن", isActive: false },
        ]),
      }),
    );
    await expect(
      inactive.prepare(3, { quantity: 2, notes: null }, 9),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("400s a yield too small to scale any ingredient", async () => {
    const service = serviceForPrepare(txForPrepare());
    await expect(
      service.prepare(3, { quantity: 0.001, notes: null }, 9),
    ).rejects.toMatchObject({ status: 400 });
  });
});
