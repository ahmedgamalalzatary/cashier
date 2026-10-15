import { describe, expect, it } from "vitest";
import { withoutCostFieldsFor } from "../../src/lib/strip-costs.js";

describe("withoutCostFieldsFor", () => {
  const orderDetail = {
    id: "o1",
    total: "100.00",
    totalCost: "60.00",
    lines: [
      {
        id: "l1",
        totalCost: "30.00",
        lineSubtotal: "100.00",
        allocations: [
          { id: "a1", quantity: "1.000", unitCost: "30.000000", lineCost: "30.00" },
        ],
      },
    ],
  };
  const refund = {
    id: "r1",
    amount: "50.00",
    totalCostReturned: "30.00",
    lines: [{ id: "rl1", returnedCost: "30.00", refundAmount: "50.00" }],
  };
  const waste = {
    id: "w1",
    totalCost: "8.00",
    allocations: [{ id: "wa1", quantity: "2.000", unitCost: "4.000000" }],
  };

  it("keeps every cost field for an admin", () => {
    expect(withoutCostFieldsFor("admin", orderDetail)).toEqual(orderDetail);
    expect(withoutCostFieldsFor("admin", refund)).toEqual(refund);
    expect(withoutCostFieldsFor("admin", waste)).toEqual(waste);
  });

  it("strips order costs and the per-line FIFO allocations for a cashier", () => {
    expect(withoutCostFieldsFor("cashier", orderDetail)).toEqual({
      id: "o1",
      total: "100.00",
      lines: [
        {
          id: "l1",
          lineSubtotal: "100.00",
          allocations: [{ id: "a1", quantity: "1.000" }],
        },
      ],
    });
  });

  it("strips refund cost figures for a cashier", () => {
    expect(withoutCostFieldsFor("cashier", refund)).toEqual({
      id: "r1",
      amount: "50.00",
      lines: [{ id: "rl1", refundAmount: "50.00" }],
    });
  });

  it("strips waste cost figures for a cashier", () => {
    expect(withoutCostFieldsFor("cashier", waste)).toEqual({
      id: "w1",
      allocations: [{ id: "wa1", quantity: "2.000" }],
    });
  });

  it("preserves non-plain objects such as Date for a cashier", () => {
    const createdAt = new Date("2024-01-02T03:04:05.000Z");
    const stripped = withoutCostFieldsFor("cashier", {
      id: "o1",
      createdAt,
      totalCost: "60.00",
    }) as Record<string, unknown>;

    expect(stripped).toEqual({ id: "o1", createdAt });
    expect(stripped.createdAt).toBeInstanceOf(Date);
    expect(new Date(stripped.createdAt as Date).toString()).not.toBe("Invalid Date");
  });
});
