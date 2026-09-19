import { describe, expect, it } from "vitest";
import { planExternalRefundQuantities } from "../../src/modules/refunds/refunds.service.js";

describe("planExternalRefundQuantities", () => {
  it("does not let per-batch rounding exceed the sale's remaining ingredient total", () => {
    const planned = planExternalRefundQuantities({
      soldQuantity: 2000n,
      priorQuantity: 0n,
      requestedQuantity: 1000n,
      allocations: [
        { id: 1, itemId: 9, quantityMilli: 1n, alreadyReturnedMilli: 0n },
        { id: 2, itemId: 9, quantityMilli: 1n, alreadyReturnedMilli: 0n },
        { id: 3, itemId: 9, quantityMilli: 1n, alreadyReturnedMilli: 0n },
      ],
    });

    const total = planned.reduce((sum, row) => sum + row.quantityMilli, 0n);
    expect(total).toBe(2n);
    expect(planned.every((row) => row.quantityMilli <= 1n)).toBe(true);
  });
});
