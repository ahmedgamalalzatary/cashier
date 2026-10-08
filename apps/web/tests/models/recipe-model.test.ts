import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import type { Recipe } from "@cashier/shared";
import {
  emptyPreparedRecipeForm,
  recipeRequestBody,
  recipeStats,
  scalePreparationIngredients,
  selectRecipeOutputItem,
} from "../../src/models/recipe-model";

describe("recipe model", () => {
  it("clears matching output ingredients and their quantities only", () => {
    const form = {
      ...emptyPreparedRecipeForm(),
      ingredients: [
        { key: 1, itemId: testId(7), quantity: "2.5" },
        { key: 2, itemId: testId(8), quantity: "1.25" },
      ],
    };

    expect(selectRecipeOutputItem(form, testId(7))).toMatchObject({
      outputItemId: testId(7),
      ingredients: [
        { key: 1, itemId: "", quantity: "" },
        { key: 2, itemId: testId(8), quantity: "1.25" },
      ],
    });
  });
  it("builds prepared-recipe request bodies from editable forms", () => {
    const prepared = emptyPreparedRecipeForm();
    prepared.name = " شربات ";
    prepared.categoryId = testId(3);
    prepared.outputItemId = testId(8);
    prepared.baseYield = "2";
    prepared.ingredients[0].itemId = testId(5);
    prepared.ingredients[0].quantity = "1";

    expect(recipeRequestBody(prepared)).toEqual({
      type: "prepared",
      name: "شربات",
      categoryId: testId(3),
      outputItemId: testId(8),
      baseYield: 2,
      ingredients: [{ itemId: testId(5), quantity: 1 }],
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
          id: testId(1),
          itemId: testId(2),
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
