import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import type { Item } from "@cashier/shared";
import {
  newPurchaseLine,
  purchaseLineAmounts,
  purchaseRequestBody,
  purchaseTotal,
} from "../../src/models/purchase-model";

const item: Item = {
  id: testId(4),
  code: 4,
  name: "بن",
  categoryId: testId(1),
  categoryName: "خامات",
  type: "raw",
  sellingPrice: null,
  stockUnit: "كجم",
  purchaseUnit: "شيكارة",
  purchaseToStockFactor: "25.000000",
  mainMinimumLevel: "0.000",
  cafeMinimumLevel: "0.000",
  hasStockHistory: false,
  isActive: true,
  createdAt: "2026-07-19T00:00:00.000Z",
};

describe("purchase form model", () => {
  it("previews purchase-unit conversion and line total", () => {
    expect(
      purchaseLineAmounts(
        {
          key: 1,
          itemId: testId(4),
          quantity: "2",
          unitMode: "purchase",
          unitPrice: "300",
        },
        item,
      ),
    ).toEqual({ stockQuantity: 50, lineTotal: 600 });
  });

  it("rounds half-cent line totals exactly like the API", () => {
    expect(
      purchaseLineAmounts({
        key: 1,
        itemId: testId(4),
        quantity: "0.005",
        unitMode: "stock",
        unitPrice: "803",
      }),
    ).toEqual({ stockQuantity: 0.005, lineTotal: 4.02 });

    expect(
      purchaseTotal([
        {
          key: 1,
          itemId: testId(4),
          quantity: "0.005",
          unitMode: "stock",
          unitPrice: "803",
        },
      ]),
    ).toBe(4.02);
  });

  it("sends each line's to-cafe amount, blank as zero", () => {
    const body = purchaseRequestBody({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      supplierId: testId(7),
      invoiceNumber: "",
      purchasedAt: "2026-07-19",
      paidAmount: 0,
      notes: "",
      lines: [
        { ...newPurchaseLine(1), itemId: testId(4), quantity: "2", unitPrice: "1", toCafeQuantity: "1.5" },
        { ...newPurchaseLine(2), itemId: testId(5), quantity: "1", unitPrice: "1" },
      ],
    });

    expect(body.lines.map((line) => line.toCafeQuantity)).toEqual([1.5, 0]);
  });

  it("sums invoice lines and builds the API request", () => {
    const first = {
      ...newPurchaseLine(1),
      itemId: testId(4),
      quantity: "2",
      unitMode: "purchase" as const,
      unitPrice: "300",
    };
    const second = {
      ...newPurchaseLine(2),
      itemId: testId(5),
      quantity: "1",
      unitPrice: "50",
    };

    expect(purchaseTotal([first, second])).toBe(650);
    expect(
      purchaseRequestBody({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        supplierId: testId(7),
        invoiceNumber: " ",
        purchasedAt: "2026-07-19",
        paidAmount: 100,
        notes: " ",
        lines: [first, second],
      }),
    ).toMatchObject({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      supplierId: testId(7),
      invoiceNumber: null,
      paidAmount: 100,
      notes: null,
      lines: [
        { itemId: testId(4), quantity: 2, unitMode: "purchase", unitPrice: 300 },
        { itemId: testId(5), quantity: 1, unitMode: "stock", unitPrice: 50 },
      ],
    });
  });
});
