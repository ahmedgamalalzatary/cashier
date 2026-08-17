import { describe, expect, it } from "vitest";
import type { ExternalOrderSummary } from "@cashier/shared";
import { formatMoney } from "../../src/lib/format";
import {
  externalOrderStatus,
  externalOrderTypeLabel,
  externalOrdersTotals,
  externalPaymentMethodLabel,
  externalPaymentStatus,
  filterExternalOrders,
} from "../../src/models/external-orders-model";

function order(
  overrides: Partial<ExternalOrderSummary> & Pick<ExternalOrderSummary, "id">,
) {
  return {
    customerName: "أحمد",
    customerPhone: "01000000000",
    subtotal: "100.00",
    discountAmount: "0.00",
    totalAmount: "100.00",
    deliveryFee: "0.00",
    createdAt: "2026-08-17T10:00:00",
    orderStatus: "pending",
    paymentStatus: "unpaid",
    paymentMethod: "cash_on_delivery",
    orderType: "pickup",
    itemCount: 1,
    ...overrides,
  } satisfies ExternalOrderSummary;
}

describe("external order filtering", () => {
  const orders = [
    order({ id: 17 }),
    order({
      id: 28,
      customerName: "منى",
      customerPhone: "01111111111",
      createdAt: "2026-08-18T01:00:00",
    }),
  ];

  it.each(["28", "منى", "01111111111"])(
    "finds an order by customer-facing query %s",
    (query) => {
      expect(filterExternalOrders(orders, { query, day: "" })).toEqual([
        orders[1],
      ]);
    },
  );

  it("filters by the Cairo wall-clock day supplied by the external backend", () => {
    expect(
      filterExternalOrders(orders, { query: "", day: "2026-08-18" }),
    ).toEqual([orders[1]]);
  });
});

describe("external order totals", () => {
  it("sums displayed money without float drift and counts pending orders", () => {
    const totals = externalOrdersTotals([
      order({ id: 1, totalAmount: "10.10", discountAmount: "0.20" }),
      order({
        id: 2,
        totalAmount: "20.20",
        discountAmount: "0.10",
        orderStatus: "completed",
      }),
    ]);

    expect(totals.sales).toBe(formatMoney("30.30"));
    expect(totals.discounts).toBe(formatMoney("0.30"));
    expect(totals.pending).toBe(1);
  });
});

describe("external order presentation", () => {
  it("translates external enums without relying on color alone", () => {
    expect(externalOrderStatus("pending")).toEqual({
      label: "قيد التنفيذ",
      tone: "neutral",
    });
    expect(externalOrderStatus("completed")).toEqual({
      label: "مكتمل",
      tone: "success",
    });
    expect(externalPaymentStatus("failed")).toEqual({
      label: "فشل الدفع",
      tone: "danger",
    });
    expect(externalOrderTypeLabel("delivery")).toBe("توصيل");
    expect(externalPaymentMethodLabel("cash_on_delivery")).toBe(
      "الدفع عند الاستلام",
    );
  });
});
