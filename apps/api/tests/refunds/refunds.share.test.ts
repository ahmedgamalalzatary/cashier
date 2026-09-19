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

  it("returns the whole allocation on a full refund without rounding loss", () => {
    const planned = planExternalRefundQuantities({
      soldQuantity: 2000n,
      priorQuantity: 0n,
      requestedQuantity: 2000n,
      allocations: [
        { id: 1, itemId: 9, quantityMilli: 3n, alreadyReturnedMilli: 0n },
        { id: 2, itemId: 9, quantityMilli: 3n, alreadyReturnedMilli: 0n },
      ],
    });

    expect(planned).toEqual([
      { id: 1, quantityMilli: 3n },
      { id: 2, quantityMilli: 3n },
    ]);
  });

  it("subtracts prior returns before sharing the remainder", () => {
    const planned = planExternalRefundQuantities({
      soldQuantity: 2000n,
      priorQuantity: 1000n,
      requestedQuantity: 1000n,
      allocations: [
        { id: 1, itemId: 9, quantityMilli: 4n, alreadyReturnedMilli: 2n },
        { id: 2, itemId: 9, quantityMilli: 4n, alreadyReturnedMilli: 0n },
      ],
    });

    const total = planned.reduce((sum, row) => sum + row.quantityMilli, 0n);
    expect(total).toBe(6n);
    expect(planned[0]?.quantityMilli).toBeLessThanOrEqual(2n);
  });

  it("tracks each ingredient independently", () => {
    const planned = planExternalRefundQuantities({
      soldQuantity: 1000n,
      priorQuantity: 0n,
      requestedQuantity: 1000n,
      allocations: [
        { id: 1, itemId: 9, quantityMilli: 5n, alreadyReturnedMilli: 5n },
        { id: 2, itemId: 7, quantityMilli: 5n, alreadyReturnedMilli: 0n },
      ],
    });

    expect(planned).toEqual([
      { id: 1, quantityMilli: 0n },
      { id: 2, quantityMilli: 5n },
    ]);
  });
});
