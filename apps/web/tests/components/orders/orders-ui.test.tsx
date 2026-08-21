import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExternalOrderSummary } from "@cashier/shared";
import { ExternalOrdersPanelView } from "../../../src/components/orders/external-orders-panel";
import { OrdersTabs } from "../../../src/components/orders/orders-tabs";
import { formatMoney } from "../../../src/lib/format";

const order = {
  id: 17,
  customerName: "عميل تجريبي",
  customerPhone: "01000000000",
  subtotal: "100.00",
  discountAmount: "5.00",
  totalAmount: "95.00",
  deliveryFee: "10.00",
  createdAt: "2026-08-17T19:30:00",
  orderStatus: "pending",
  paymentStatus: "unpaid",
  paymentMethod: "cash_on_delivery",
  orderType: "delivery",
  itemCount: 2,
} satisfies ExternalOrderSummary;

const view = (
  overrides: Partial<Parameters<typeof ExternalOrdersPanelView>[0]> = {},
) =>
  renderToStaticMarkup(
    <ExternalOrdersPanelView
      orders={[]}
      loading={false}
      error=""
      query=""
      day=""
      onQueryChange={vi.fn()}
      onDayChange={vi.fn()}
      {...overrides}
    />,
  );

describe("orders UI", () => {
  it("renders the two order sources as accessible tabs", () => {
    const html = renderToStaticMarkup(
      <OrdersTabs active="cashier" onChange={vi.fn()} />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="orders-cashier-tab"');
    expect(html).toContain('aria-controls="orders-cashier-panel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("طلبات الكاشير");
    expect(html).toContain("طلبات الأونلاين");
  });

  it("shows the online loading state", () => {
    expect(view({ loading: true })).toContain("جارِ تحميل طلبات الأونلاين");
  });

  it("shows an online failure without claiming the list is empty", () => {
    const html = view({ error: "الخدمة غير متاحة" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("الخدمة غير متاحة");
    expect(html).not.toContain("لا توجد طلبات أونلاين بعد");
  });

  it("uses the filtered empty message when the server returns no matches", () => {
    const filtered = view({ query: "missing" });
    expect(filtered).toContain("لا توجد طلبات تطابق عوامل التصفية الحالية.");
    expect(filtered).not.toContain("لا توجد طلبات أونلاين بعد");
    expect(view()).toContain("لا توجد طلبات أونلاين بعد");
  });

  it("renders successful online order rows", () => {
    const html = view({ orders: [order] });
    expect(html).toContain("عميل تجريبي");
    expect(html).toContain("01000000000");
    expect(html).toContain("قيد التنفيذ");
    expect(html).toContain(formatMoney("95.00"));
  });
});
