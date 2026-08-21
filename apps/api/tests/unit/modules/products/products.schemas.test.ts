import { describe, expect, it } from "vitest";
import { productStockSetupInput } from "../../../../src/modules/products/products.schemas.js";

describe("productStockSetupInput", () => {
  it("accepts mapped targets and explicit no-stock-effect modifiers", () => {
    expect(
      productStockSetupInput.parse({
        baseIngredients: [{ itemId: 1, quantity: 0.25 }],
        sizes: [],
        modifiers: [
          { externalModifierOptionId: 10, stockEffect: "none" },
          {
            externalModifierOptionId: 11,
            stockEffect: "mapped",
            ingredients: [{ itemId: 2, quantity: 1 }],
          },
        ],
      }),
    ).toBeTruthy();
  });

  it("rejects mapped modifiers without ingredients", () => {
    expect(() =>
      productStockSetupInput.parse({
        baseIngredients: [],
        sizes: [],
        modifiers: [
          {
            externalModifierOptionId: 11,
            stockEffect: "mapped",
            ingredients: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate targets and duplicate ingredients", () => {
    expect(() =>
      productStockSetupInput.parse({
        baseIngredients: [
          { itemId: 1, quantity: 1 },
          { itemId: 1, quantity: 2 },
        ],
        sizes: [
          { externalSizeId: 4, ingredients: [{ itemId: 2, quantity: 1 }] },
          { externalSizeId: 4, ingredients: [{ itemId: 3, quantity: 1 }] },
        ],
        modifiers: [],
      }),
    ).toThrow();
  });
});
