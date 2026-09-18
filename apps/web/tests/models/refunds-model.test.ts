import { describe, expect, it } from "vitest";
import {
  refundDraftEntry,
  type RefundDraftLine,
} from "../../src/models/refunds-model";

describe("refunds model", () => {
  it("falls back to an empty draft entry instead of crashing on desync", () => {
    const draft: Record<number, RefundDraftLine> = {
      7: { quantity: 2, stockAction: "return_to_stock", refundedQuantity: 1 },
    };

    expect(refundDraftEntry(draft, 7)).toEqual({
      quantity: 2,
      stockAction: "return_to_stock",
      refundedQuantity: 1,
    });
    expect(refundDraftEntry(draft, 999)).toEqual({
      quantity: 0,
      stockAction: null,
      refundedQuantity: 0,
    });
  });
});
