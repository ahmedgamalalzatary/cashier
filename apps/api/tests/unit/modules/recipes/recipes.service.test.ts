import { describe, expect, it, vi } from "vitest";
import type { RecipesRepository } from "../../../../src/modules/recipes/recipes.repository.js";
import { RecipesService } from "../../../../src/modules/recipes/recipes.service.js";

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
