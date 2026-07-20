import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OrderDetail } from "@cashier/shared";
import { OrderReceipt } from "../../../src/components/pos/order-receipt";
import { formatMoney } from "../../../src/lib/format";

const order: OrderDetail = {
  id: 1,
  orderNumber: "POS-20260720-ABC12345",
  cashierId: 2,
  cashierName: "سارة",
  shiftId: null,
  subtotal: "80.00",
  discountType: "percent",
  discountValue: "10.00",
  discountAmount: "8.00",
  total: "72.00",
  cashReceived: "100.00",
  changeAmount: "28.00",
  totalCost: "20.00",
  isNegativeStock: false,
  createdAt: "2026-07-20T10:00:00.000Z",
  lines: [
    {
      id: 3,
      type: "recipe",
      recipeId: 5,
      recipeSizeId: 6,
      itemId: null,
      productName: "لاتيه",
      sizeName: "كبير",
      quantity: "2.000",
      unitPrice: "40.00",
      lineSubtotal: "80.00",
      totalCost: "20.00",
      hasStockDeficit: false,
      allocations: [],
    },
    {
      id: 4,
      type: "item",
      recipeId: null,
      recipeSizeId: null,
      itemId: 8,
      productName: "مياه",
      sizeName: null,
      quantity: "2.500",
      unitPrice: "10.00",
      lineSubtotal: "25.00",
      totalCost: "12.00",
      hasStockDeficit: false,
      allocations: [],
    },
  ],
};

describe("order receipt", () => {
  it("renders the required Arabic 80mm receipt fields from snapshots", () => {
    const html = renderToStaticMarkup(<OrderReceipt order={order} />);

    expect(html).toContain('id="pos-receipt"');
    expect(html).toContain("الكافيه");
    expect(html).toContain("POS-20260720-ABC12345");
    expect(html).toContain(formatMoney("10.00"));
    expect(html).toContain("سارة");
    expect(html).toContain("لاتيه");
    expect(html).toContain("كبير");
    expect(html).toContain("الخصم");
    expect(html).toContain("المستلم");
    expect(html).toContain("الباقي");
  });

  it("renders the final row of a 100-line printable receipt", () => {
    const lines = Array.from({ length: 100 }, (_, index) => ({
      ...order.lines[1],
      id: index + 100,
      productName: `منتج-${index + 1}`,
    }));

    const html = renderToStaticMarkup(
      <OrderReceipt order={{ ...order, lines }} />,
    );
    expect(html).toContain("منتج-100");
  });
});
