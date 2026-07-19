import { describe, expect, it } from "vitest";
import {
  newTransferLine,
  transferRequestBody,
  transferTotalQuantity,
} from "../../src/models/transfer-model";

describe("transfer model", () => {
  it("builds normalized transfer request bodies", () => {
    expect(
      transferRequestBody({
        notes: "  للوردية  ",
        lines: [
          { key: 1, itemId: "3", quantity: "2.500" },
          { key: 2, itemId: "7", quantity: "1" },
        ],
      }),
    ).toEqual({
      notes: "للوردية",
      lines: [
        { itemId: 3, quantity: 2.5 },
        { itemId: 7, quantity: 1 },
      ],
    });
  });

  it("provides blank lines and totals their quantities", () => {
    expect(newTransferLine(5)).toEqual({ key: 5, itemId: "", quantity: "" });
    expect(
      transferTotalQuantity([
        { key: 1, itemId: "3", quantity: "2.5" },
        { key: 2, itemId: "7", quantity: "1" },
      ]),
    ).toBe(3.5);
  });
});
