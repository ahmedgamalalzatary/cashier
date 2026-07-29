import { describe, expect, it } from "vitest";
import { refundInput } from "../../../../src/modules/refunds/refunds.schemas.js";

describe("refundInput", () => {
  it("accepts selected order lines with explicit resale stock handling", () => {
    expect(
      refundInput.parse({
        clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
        orderId: 12,
        reason: "طلب العميل",
        lines: [
          { orderLineId: 7, quantity: 1, stockAction: "return_to_stock" },
          { orderLineId: 8, quantity: 2 },
        ],
      }),
    ).toEqual({
      clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
      orderId: 12,
      reason: "طلب العميل",
      lines: [
        { orderLineId: 7, quantity: 1, stockAction: "return_to_stock" },
        { orderLineId: 8, quantity: 2, stockAction: null },
      ],
    });
  });

  it("rejects duplicate lines and imprecise quantities", () => {
    expect(() =>
      refundInput.parse({
        clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
        orderId: 12,
        reason: "سبب",
        lines: [
          { orderLineId: 7, quantity: 0.0001 },
          { orderLineId: 7, quantity: 1 },
        ],
      }),
    ).toThrow();
  });
});
