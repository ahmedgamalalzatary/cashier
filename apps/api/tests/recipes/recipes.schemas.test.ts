import { describe, expect, it } from "vitest";
import {
  preparationInput,
  recipeInput,
} from "../../src/modules/recipes/recipes.schemas.js";

const validRecipe = {
  name: "كابتشينو",
  categoryId: 2,
  type: "prepared",
  outputItemId: 5,
  baseYield: 10,
  ingredients: [
    { itemId: 1, quantity: 0.5 },
    { itemId: 2, quantity: 0.2 },
  ],
};

describe("recipe schema", () => {
  it("accepts a valid prepared recipe", () => {
    expect(recipeInput.parse(validRecipe).name).toBe("كابتشينو");
  });

  it("rejects legacy product types and unknown keys", () => {
    expect(
      recipeInput.safeParse({ ...validRecipe, type: "product" }).success,
    ).toBe(false);
    expect(
      recipeInput.safeParse({ ...validRecipe, extra: 1 }).success,
    ).toBe(false);
  });

  it("rejects duplicate ingredients and bad quantities", () => {
    expect(
      recipeInput.safeParse({
        ...validRecipe,
        ingredients: [
          { itemId: 1, quantity: 0.5 },
          { itemId: 1, quantity: 0.2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      recipeInput.safeParse({ ...validRecipe, baseYield: 0 }).success,
    ).toBe(false);
    expect(
      recipeInput.safeParse({
        ...validRecipe,
        ingredients: [{ itemId: 1, quantity: 0.0005 }],
      }).success,
    ).toBe(false);
    expect(
      recipeInput.safeParse({ ...validRecipe, ingredients: [] }).success,
    ).toBe(false);
  });
});

describe("preparation schema", () => {
  it("blanks notes to null and rejects tiny or missing quantities", () => {
    expect(
      preparationInput.parse({ quantity: 2, notes: "   " }),
    ).toEqual({ quantity: 2, notes: null });
    expect(
      preparationInput.safeParse({ quantity: 0, notes: null }).success,
    ).toBe(false);
    expect(
      preparationInput.safeParse({ quantity: 1.0005, notes: null }).success,
    ).toBe(false);
  });
});
