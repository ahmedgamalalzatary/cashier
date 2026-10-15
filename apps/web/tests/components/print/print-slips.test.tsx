import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExternalOrderSummary } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { ExternalOrderSlip } from "../../../src/components/orders/external-order-slip";

const printable = (html: string) => {
  // The 80mm slips use the shared receipt page.
  expect(html).toContain("receipt-print-root");
};

describe("80mm print slips", () => {
  it("prints one online order without inventing item names", () => {
    const order = {
      id: 17,
      customerName: "عميل تجريبي",
      customerPhone: "01000000000",
      subtotal: "100.00",
      discountAmount: "5.00",
      totalAmount: "105.00",
      deliveryFee: "10.00",
      createdAt: "2026-08-17T19:30:00",
      orderStatus: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "cash_on_delivery",
      orderType: "delivery",
      itemCount: 2,
    } satisfies ExternalOrderSummary;

    const html = renderToStaticMarkup(<ExternalOrderSlip order={order} />);

    printable(html);
    expect(html).toContain("طلب أونلاين");
    expect(html).toContain("#17");
    expect(html).toContain("عميل تجريبي");
    expect(html).toContain("01000000000");
    expect(html).toContain("توصيل");
    expect(html).toContain("الدفع عند الاستلام");
    expect(html).toContain("عدد الأصناف");
    expect(html).toContain(formatMoney("10.00"));
    expect(html).toContain(formatMoney("105.00"));
  });
});
