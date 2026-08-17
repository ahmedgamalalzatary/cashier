import { describe, expect, it } from "vitest";
import type { OrderSummary } from "@cashier/shared";
import { formatMoney } from "../../src/lib/format";
import {
  filterOrders,
  orderCashiers,
  orderMargin,
  ordersTotals,
  splitOrderNumber,
} from "../../src/models/orders-model";

function order(overrides: Partial<OrderSummary> & Pick<OrderSummary, "id">) {
  return {
    orderNumber: `ORD-${overrides.id}`,
    cashierId: 1,
    cashierName: "أحمد",
    shiftId: 1,
    subtotal: "100.00",
    discountType: null,
    discountValue: null,
    discountAmount: "0.00",
    total: "100.00",
    cashReceived: "100.00",
    changeAmount: "0.00",
    totalCost: "40.00",
    isNegativeStock: false,
    // 10:00 Cairo on 2026-08-02
    createdAt: "2026-08-02T07:00:00.000Z",
    ...overrides,
  } satisfies OrderSummary;
}

describe("filterOrders", () => {
  const orders = [
    order({ id: 1, orderNumber: "ORD-0001", cashierId: 1, cashierName: "أحمد" }),
    order({ id: 2, orderNumber: "ORD-0002", cashierId: 2, cashierName: "منى" }),
    order({
      id: 3,
      orderNumber: "ORD-0003",
      cashierId: 1,
      cashierName: "أحمد",
      createdAt: "2026-08-03T07:00:00.000Z",
    }),
  ];
  const all = { query: "", cashierId: null, day: "" };

  it("keeps every order when no filter is set", () => {
    expect(filterOrders(orders, all)).toEqual(orders);
  });

  it("matches an order number regardless of case and padding", () => {
    expect(filterOrders(orders, { ...all, query: "  ord-0002 " })).toEqual([
      orders[1],
    ]);
  });

  it("matches a cashier name", () => {
    expect(filterOrders(orders, { ...all, query: "منى" })).toEqual([orders[1]]);
  });

  it("keeps only the chosen cashier", () => {
    expect(filterOrders(orders, { ...all, cashierId: 1 })).toEqual([
      orders[0],
      orders[2],
    ]);
  });

  it("keeps only orders opened on the chosen Cairo day", () => {
    expect(filterOrders(orders, { ...all, day: "2026-08-03" })).toEqual([
      orders[2],
    ]);
  });

  it("reads a late-night order as the Cairo day, not the UTC day", () => {
    // 01:00 Cairo on 2026-08-03 is still 2026-08-02 in UTC
    const late = order({ id: 4, createdAt: "2026-08-02T22:00:00.000Z" });
    expect(filterOrders([late], { ...all, day: "2026-08-03" })).toEqual([late]);
  });

  it("applies every filter together", () => {
    expect(
      filterOrders(orders, {
        query: "أحمد",
        cashierId: 1,
        day: "2026-08-02",
      }),
    ).toEqual([orders[0]]);
  });
});

describe("ordersTotals", () => {
  it("counts the orders and sums their money without float drift", () => {
    const totals = ordersTotals([
      order({ id: 1, total: "10.10", discountAmount: "0.20" }),
      order({ id: 2, total: "20.20", discountAmount: "0.10" }),
    ]);
    expect(totals.count).toBe(2);
    expect(totals.sales).toBe(formatMoney("30.30"));
    expect(totals.discounts).toBe(formatMoney("0.30"));
  });

  it("counts in the same Arabic-Indic digits as the money beside it", () => {
    expect(ordersTotals([order({ id: 1 }), order({ id: 2 })]).countLabel).toBe(
      "٢",
    );
  });

  it("reads as zero for an empty list", () => {
    const totals = ordersTotals([]);
    expect(totals.count).toBe(0);
    expect(totals.countLabel).toBe("٠");
    expect(totals.sales).toBe(formatMoney(0));
    expect(totals.discounts).toBe(formatMoney(0));
  });
});

describe("splitOrderNumber", () => {
  it("separates the day the order belongs to from its own code", () => {
    expect(splitOrderNumber("POS-20260802-E24D855D")).toEqual({
      prefix: "POS-20260802",
      code: "E24D855D",
    });
  });

  it("leaves a number it cannot split whole", () => {
    expect(splitOrderNumber("ORD-1")).toEqual({ prefix: "", code: "ORD-1" });
  });
});

describe("orderMargin", () => {
  it("reads profit as what is left of the total after cost", () => {
    const margin = orderMargin(
      order({ id: 1, total: "30.30", totalCost: "10.10" }),
    );
    expect(margin.cost).toBe(formatMoney("10.10"));
    expect(margin.profit).toBe(formatMoney("20.20"));
  });

  it("reports a loss when the cost ran past the total", () => {
    const margin = orderMargin(
      order({ id: 1, total: "5.00", totalCost: "7.50" }),
    );
    expect(margin.profit).toBe(formatMoney("-2.50"));
  });
});

describe("orderCashiers", () => {
  it("lists each cashier once, by first appearance", () => {
    expect(
      orderCashiers([
        order({ id: 1, cashierId: 2, cashierName: "منى" }),
        order({ id: 2, cashierId: 1, cashierName: "أحمد" }),
        order({ id: 3, cashierId: 2, cashierName: "منى" }),
      ]),
    ).toEqual([
      { id: 2, name: "منى" },
      { id: 1, name: "أحمد" },
    ]);
  });
});
