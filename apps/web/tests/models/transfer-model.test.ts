import { describe, expect, it } from "vitest";
import type { InventoryStockRow, PurchaseInvoiceLine } from "@cashier/shared";
import {
  invoiceTransferRows,
  mergeTransferLines,
  newTransferLine,
  selectedTransferLines,
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
        notes: "  للوردية  ",
        lines: [
          { key: 1, itemId: "3", quantity: "2.500" },
          { key: 2, itemId: "7", quantity: "1" },
        ],
      }),
    ).toEqual({
      notes: "للوردية",
      lines: [
        { itemId: 3, quantity: 2.5 },
        { itemId: 7, quantity: 1 },
      ],
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

  it("merges applied invoice rows into the lines already entered", () => {
    const existing = [
      { key: 1, itemId: "3", quantity: "1" },
      { key: 2, itemId: "", quantity: "" },
    ];
    const applied = [
      { key: 8, itemId: "3", quantity: "4" },
      { key: 9, itemId: "7", quantity: "2" },
    ];

    // the blank line is dropped, item 3 keeps its existing key but takes the
    // invoice quantity, and item 7 is appended — the API rejects duplicates
    expect(mergeTransferLines(existing, applied)).toEqual([
      { key: 1, itemId: "3", quantity: "4" },
      { key: 9, itemId: "7", quantity: "2" },
    ]);
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
