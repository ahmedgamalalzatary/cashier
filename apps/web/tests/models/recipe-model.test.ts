import { describe, expect, it } from "vitest";
import {
  emptyPreparedRecipeForm,
  emptyProductRecipeForm,
  recipeRequestBody,
  scalePreparationIngredients,
  recipeStats,
} from "../../src/models/recipe-model";
import type { Recipe } from "@cashier/shared";

describe("recipe model", () => {
  it("builds product and prepared request bodies from editable forms", () => {
    const product = emptyProductRecipeForm();
    product.name = "  لاتيه  ";
    product.categoryId = "2";
    product.sizes[0].name = " صغير ";
    product.sizes[0].sellingPrice = "30";
    product.sizes[0].ingredients[0].itemId = "4";
    product.sizes[0].ingredients[0].quantity = "0.2";

    expect(recipeRequestBody(product)).toEqual({
      type: "product",
      name: "لاتيه",
      categoryId: 2,
      sizes: [
        {
          name: "صغير",
          sellingPrice: 30,
          ingredients: [{ itemId: 4, quantity: 0.2 }],
        },
      ],
    });

    const prepared = emptyPreparedRecipeForm();
    prepared.name = " شربات ";
    prepared.categoryId = "3";
    prepared.outputItemId = "8";
    prepared.baseYield = "2";
    prepared.ingredients[0].itemId = "5";
    prepared.ingredients[0].quantity = "1";
    expect(recipeRequestBody(prepared)).toEqual({
      type: "prepared",
      name: "شربات",
      categoryId: 3,
      outputItemId: 8,
      baseYield: 2,
      ingredients: [{ itemId: 5, quantity: 1 }],
    });
  });

  it("counts active, unavailable, and prepared recipes", () => {
    const recipes = [
      { type: "product", isActive: true, sizes: [{ hasSufficientStock: true }] },
      { type: "product", isActive: true, sizes: [{ hasSufficientStock: false }] },
      { type: "prepared", isActive: false, hasSufficientStock: true },
    ] as Recipe[];
    expect(recipeStats(recipes)).toEqual({
      active: 2,
      unavailable: 1,
      prepared: 1,
    });
  });

  it("mirrors the API's three-decimal preparation scaling before checking stock", () => {
    const [ingredient] = scalePreparationIngredients(
      [
        {
          id: 1,
          itemId: 2,
          itemName: "مكوّن",
          itemType: "raw",
          stockUnit: "كجم",
          requiredQuantity: "1.000",
          availableQuantity: "1.000",
          currentCost: "2.00",
          hasSufficientStock: true,
          itemIsActive: true,
        },
      ],
      "3.000",
      "2.999",
    );

    expect(ingredient.scaledQuantity).toBe(1);
    expect(ingredient.hasSufficientStock).toBe(true);
  });
});
