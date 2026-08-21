import { describe, expect, it } from "vitest";
import type { Recipe } from "@cashier/shared";
import {
  emptyPreparedRecipeForm,
  recipeRequestBody,
  recipeStats,
  scalePreparationIngredients,
} from "../../src/models/recipe-model";

describe("recipe model", () => {
  it("builds prepared-recipe request bodies from editable forms", () => {
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

  it("counts active and unavailable prepared recipes", () => {
    const recipes = [
      { type: "prepared", isActive: true, hasSufficientStock: true },
      { type: "prepared", isActive: true, hasSufficientStock: false },
      { type: "prepared", isActive: false, hasSufficientStock: true },
    ] as Recipe[];

    expect(recipeStats(recipes)).toEqual({
      active: 2,
      unavailable: 1,
      prepared: 3,
    });
  });

  it("mirrors the API's three-decimal preparation scaling before checking stock", () => {
    const [ingredient] = scalePreparationIngredients(
      [
        {
          id: 1,
          itemId: 2,
          itemCode: 2,
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
