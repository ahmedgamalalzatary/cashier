import { describe, expect, it } from "vitest";
import { countedLinesFromDraft } from "../../src/models/stocktake-model";

describe("stocktake counted lines", () => {
  it("treats a blank count as missing instead of zero", () => {
    expect(
      countedLinesFromDraft([
        { itemId: 1, countedQuantity: "" },
        { itemId: 2, countedQuantity: null },
      ]),
    ).toEqual({ ok: false });
  });

  it("accepts an explicit zero and other filled counts", () => {
    expect(
      countedLinesFromDraft([
        { itemId: 1, countedQuantity: "0" },
        { itemId: 2, countedQuantity: 3.5 },
      ]),
    ).toEqual({
      ok: true,
      lines: [
        { itemId: 1, countedQuantity: 0 },
        { itemId: 2, countedQuantity: 3.5 },
      ],
    });
  });

  it("rejects a negative or non-numeric count", () => {
    expect(
      countedLinesFromDraft([{ itemId: 1, countedQuantity: "-1" }]),
    ).toEqual({ ok: false });
    expect(
      countedLinesFromDraft([{ itemId: 1, countedQuantity: "abc" }]),
    ).toEqual({ ok: false });
  });
});
