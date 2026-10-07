import { describe, expect, it } from "vitest";
import type { InventoryStockRow, PurchaseInvoiceLine } from "@cashier/shared";
import {
  invoiceTransferRows,
  newTransferLine,
  selectedTransferLines,
  transferDirectBody,
  transferRequestBody,
  transferTotalQuantity,
} from "../../src/models/transfer-model";

function invoiceLine(
  overrides: Partial<PurchaseInvoiceLine> & { itemId: number },
): PurchaseInvoiceLine {
  return {
    id: overrides.itemId,
    itemCode: overrides.itemId,
    itemName: `صنف ${overrides.itemId}`,
    quantity: "1.000",
    unitMode: "stock",
    unitName: "كجم",
    stockQuantity: "1.000",
    stockUnit: "كجم",
    unitPrice: "10.00",
    unitCost: "10.00",
    lineTotal: "10.00",
    transferredToCafeQuantity: "0.000",
    ...overrides,
  };
}

function stockRow(itemId: number, quantity: string): InventoryStockRow {
  return {
    itemId,
    code: itemId,
    name: `صنف ${itemId}`,
    categoryId: 1,
    categoryName: "تصنيف",
    type: "raw",
    stockUnit: "كجم",
    quantity,
    stockValue: "0",
    minimumLevel: "0",
    isLowStock: false,
    isNegativeStock: false,
    isActive: true,
  };
}

describe("transfer model", () => {
  it("builds normalized transfer request bodies", () => {
    expect(
      transferRequestBody({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        notes: "  للوردية  ",
        lines: [
          { key: 1, itemId: "3", quantity: "2.500" },
          { key: 2, itemId: "7", quantity: "1" },
        ],
      }),
    ).toEqual({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      notes: "للوردية",
      lines: [
        { itemId: 3, quantity: 2.5 },
        { itemId: 7, quantity: 1 },
      ],
    });
  });

  it("builds keyless direct transfer bodies", () => {
    expect(
      transferDirectBody({
        notes: "  مباشر  ",
        lines: [{ key: 1, itemId: "3", quantity: "2.500" }],
      }),
    ).toEqual({
      notes: "مباشر",
      lines: [{ itemId: 3, quantity: 2.5 }],
    });
  });

  it("merges repeated invoice lines for the same item", () => {
    const rows = invoiceTransferRows(
      [
        invoiceLine({ itemId: 3, stockQuantity: "2.000" }),
        invoiceLine({ itemId: 3, stockQuantity: "1.500" }),
      ],
      [stockRow(3, "10.000")],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemId: 3,
      invoiceQuantity: 3.5,
      quantity: "3.5",
      clamped: false,
      selected: true,
    });
  });

  it("clamps a line to the stock left in the main warehouse and flags it", () => {
    const [row] = invoiceTransferRows(
      [invoiceLine({ itemId: 3, stockQuantity: "8.000" })],
      [stockRow(3, "2.500")],
    );

    expect(row).toMatchObject({
      invoiceQuantity: 8,
      availableQuantity: 2.5,
      quantity: "2.5",
      clamped: true,
      selected: true,
    });
  });

  it("leaves items with no remaining stock unselected", () => {
    const [row] = invoiceTransferRows(
      [invoiceLine({ itemId: 3, stockQuantity: "8.000" })],
      [stockRow(3, "0.000")],
    );

    expect(row).toMatchObject({
      availableQuantity: 0,
      quantity: "0",
      clamped: true,
      selected: false,
    });
  });

  it("treats an item missing from main stock as unavailable", () => {
    const [row] = invoiceTransferRows(
      [invoiceLine({ itemId: 9, stockQuantity: "4.000" })],
      [],
    );

    expect(row).toMatchObject({ availableQuantity: 0, selected: false });
  });

  it("refuses a deactivated item the manual picker could not offer", () => {
    const [row] = invoiceTransferRows(
      [invoiceLine({ itemId: 3, stockQuantity: "2.000" })],
      [{ ...stockRow(3, "5.000"), isActive: false }],
    );

    expect(row).toMatchObject({
      availableQuantity: 0,
      quantity: "0",
      inactive: true,
      selected: false,
    });
  });

  it("turns the selected rows into keyed transfer lines", () => {
    const rows = invoiceTransferRows(
      [
        invoiceLine({ itemId: 3, stockQuantity: "2.000" }),
        invoiceLine({ itemId: 7, stockQuantity: "1.000" }),
      ],
      [stockRow(3, "10.000"), stockRow(7, "10.000")],
    );
    rows[1].selected = false;

    expect(selectedTransferLines(rows, 4)).toEqual([
      { key: 4, itemId: "3", quantity: "2" },
    ]);
  });

  it("offers only what the invoice still owes the cafe, not the full invoice again", () => {
    const [row] = invoiceTransferRows(
      [
        invoiceLine({
          itemId: 3,
          stockQuantity: "20.000",
          transferredToCafeQuantity: "5.000",
        }),
      ],
      [stockRow(3, "50.000")],
    );

    expect(row).toMatchObject({
      invoiceQuantity: 20,
      transferredQuantity: 5,
      // 15 still owed, main stock is plenty
      quantity: "15",
      availableQuantity: 50,
      clamped: false,
      selected: true,
    });
  });

  it("caps the invoice remainder at the main stock and flags it", () => {
    const [row] = invoiceTransferRows(
      [
        invoiceLine({
          itemId: 3,
          stockQuantity: "20.000",
          transferredToCafeQuantity: "18.000",
        }),
      ],
      [stockRow(3, "1.500")],
    );

    expect(row).toMatchObject({
      transferredQuantity: 18,
      quantity: "1.5",
      availableQuantity: 1.5,
      clamped: true,
    });
  });

  it("leaves a fully transferred item unselected", () => {
    const [row] = invoiceTransferRows(
      [
        invoiceLine({
          itemId: 3,
          stockQuantity: "20.000",
          transferredToCafeQuantity: "20.000",
        }),
      ],
      [stockRow(3, "10.000")],
    );

    expect(row).toMatchObject({
      transferredQuantity: 20,
      quantity: "0",
      selected: false,
    });
  });

  it("sums repeated invoice lines before subtracting what already went to the cafe", () => {
    const [row] = invoiceTransferRows(
      [
        invoiceLine({
          itemId: 3,
          stockQuantity: "2.000",
          transferredToCafeQuantity: "0.400",
        }),
        invoiceLine({
          itemId: 3,
          stockQuantity: "1.500",
          transferredToCafeQuantity: "0.400",
        }),
      ],
      [stockRow(3, "10.000")],
    );

    // the cafe already holds 0.8 of this item from this invoice
    expect(row).toMatchObject({
      invoiceQuantity: 3.5,
      transferredQuantity: 0.8,
      quantity: "2.7",
    });
  });

  it("carries the source invoice onto the direct transfer body", () => {
    expect(
      transferDirectBody({
        notes: "  مباشر  ",
        purchaseInvoiceId: 12,
        lines: [{ key: 1, itemId: "3", quantity: "2.500" }],
      }),
    ).toEqual({
      notes: "مباشر",
      purchaseInvoiceId: 12,
      lines: [{ itemId: 3, quantity: 2.5 }],
    });
  });

  it("omits the invoice link when the transfer has no source invoice", () => {
    expect(
      transferDirectBody({
        notes: "  ",
        lines: [{ key: 1, itemId: "3", quantity: "1" }],
      }),
    ).toEqual({
      notes: null,
      lines: [{ itemId: 3, quantity: 1 }],
    });
  });

  it("provides blank lines and totals their quantities", () => {
    expect(newTransferLine(5)).toEqual({ key: 5, itemId: "", quantity: "" });
    expect(
      transferTotalQuantity([
        { key: 1, itemId: "3", quantity: "2.5" },
        { key: 2, itemId: "7", quantity: "1" },
      ]),
    ).toBe(3.5);
  });
});
