import { describe, expect, it } from "vitest";
import {
  confirmStocktakeInput,
  manualAdjustmentInput,
  startStocktakeInput,
  updateStocktakeCountsInput,
} from "../../src/modules/stocktakes/stocktakes.schemas.js";

describe("stocktake schemas", () => {
  it("accepts a scoped session and non-negative counted quantities", () => {
    expect(
      startStocktakeInput.parse({ warehouse: "main", categoryId: "3" }),
    ).toEqual({
      warehouse: "main",
      categoryId: 3,
      note: null,
    });
    expect(
      updateStocktakeCountsInput.parse({
        lines: [{ itemId: "7", countedQuantity: "0" }],
      }),
    ).toEqual({
      lines: [{ itemId: 7, countedQuantity: 0 }],
    });
  });

  it("rejects duplicate lines, over-precise counts, and an empty reason note", () => {
    expect(() =>
      updateStocktakeCountsInput.parse({
        lines: [
          { itemId: 7, countedQuantity: 1 },
          { itemId: 7, countedQuantity: 2 },
        ],
      }),
    ).toThrow();
    expect(() =>
      updateStocktakeCountsInput.parse({
        lines: [{ itemId: 7, countedQuantity: 1.0005 }],
      }),
    ).toThrow();
    expect(() => confirmStocktakeInput.parse({ note: " " })).toThrow();
    expect(() =>
      manualAdjustmentInput.parse({
        warehouse: "cafe",
        itemId: 7,
        countedQuantity: 2,
        note: " ",
      }),
    ).toThrow();
  });
});
